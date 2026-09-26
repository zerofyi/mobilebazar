<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Models\Customer;
use App\Models\User;
use App\Services\CustomerIdentityService;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    public function __construct(
        protected OtpService $otpService,
        protected CustomerIdentityService $identityService,
        protected Request $request,
    ) {}

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            ...$this->profileRules(),
            'password' => $this->passwordRules(),
        ], [
            'mobile.regex' => __('Please enter a valid 10-digit Indian mobile number.'),
        ])->validate();

        return DB::transaction(function () use ($input) {
            $mobile = preg_replace('/[^0-9]/', '', $input['mobile']);

            $user = User::create([
                'name'     => $input['name'],
                'email'    => $input['email'],
                'mobile'   => $mobile,
                'password' => $input['password'],
            ]);

            $existingCustomer = Customer::where('phone_primary', $mobile)
                ->orWhere('phone_primary', 'like', "%{$mobile}")
                ->first();

            if ($existingCustomer) {
                $preferredName = !empty($input['name']) ? $input['name'] : $existingCustomer->name;
                $this->identityService->syncIdentity($existingCustomer, $user, $preferredName);
            }

            $this->otpService->generate($user->mobile, 'registration', $this->request->ip());

            return $user;
        });
    }
}
