#!/bin/sh
set -eu

# The queue worker reads job_queue as soon as the server boots, so the schema must be current first.
if [ "${1:-serve}" = "serve" ]; then
	pnpm db:migrate
	exec node build
fi

exec "$@"
