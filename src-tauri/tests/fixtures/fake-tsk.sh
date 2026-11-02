#!/bin/sh
printf '%s' "$FAKE_STDOUT"
printf '%s' "$FAKE_STDERR" >&2
exit "${FAKE_EXIT:-0}"
