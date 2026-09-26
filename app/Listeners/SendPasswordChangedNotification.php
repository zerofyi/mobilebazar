<?php

namespace App\Listeners;

use App\Notifications\PasswordChangedNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Contracts\Queue\ShouldQueue;

class SendPasswordChangedNotification implements ShouldQueue
{
    /**
     * Number of times the queued job may be attempted.
     */
    public int $tries = 3;

    /**
     * Handle the event.
     */
    public function handle(PasswordReset $event): void
    {
        $event->user->notify(new PasswordChangedNotification());
    }
}
