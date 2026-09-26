<?php

return [
    'max_generate_per_hour' => (int) env('OTP_MAX_GENERATE_PER_HOUR', 5),
    'max_verify_attempts'   => (int) env('OTP_MAX_VERIFY_ATTEMPTS', 5),
    'expires_in_minutes'    => (int) env('OTP_EXPIRES_MINUTES', 15),
    'prune_after_days'      => (int) env('OTP_PRUNE_AFTER_DAYS', 30),
];
