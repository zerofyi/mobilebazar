<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Loan delete PIN
    |--------------------------------------------------------------------------
    |
    | 4-digit PIN required to delete a loan (the "2FA kinda" gate on the
    | delete action). Compared with hash_equals() — never logged, never
    | exposed to the client. When empty, loan deletion is disabled:
    | every attempt fails closed with "Incorrect delete PIN."
    |
    */

    'delete_pin' => env('LOAN_DELETE_PIN', ''),

];
