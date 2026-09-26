<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Channel;
use Illuminate\Database\Seeder;

class ChannelSeeder extends Seeder
{
    public function run(): void
    {
        $channels = [
            ['code' => 'POS', 'name' => 'In-Store POS', 'is_active' => true],
            ['code' => 'WEB', 'name' => 'Online Storefront', 'is_active' => true],
            ['code' => 'APP', 'name' => 'Mobile App', 'is_active' => true],
            ['code' => 'MARKETPLACE', 'name' => 'Third-Party Marketplace', 'is_active' => true],
        ];

        foreach ($channels as $channel) {
            Channel::updateOrCreate(
                ['code' => $channel['code']],
                $channel
            );
        }
    }
}
