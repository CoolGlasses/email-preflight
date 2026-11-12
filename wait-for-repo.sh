#!/bin/bash
# Poll until CoolGlasses/email-preflight exists on GitHub (Alfred creates it
# after reading the mailbox ask), then exit 0. Exit 1 after ~55 minutes.
export GIT_SSH_COMMAND="ssh -F /home/hatch/.ssh/config -o UserKnownHostsFile=/home/hatch/.ssh/known_hosts"
for i in $(seq 1 55); do
  if git ls-remote git@github.com:CoolGlasses/email-preflight.git >/dev/null 2>&1; then
    echo "REPO EXISTS after $i minute(s) — $(date -Is)"
    exit 0
  fi
  sleep 60
done
echo "TIMEOUT: repo not found after 55 minutes — $(date -Is)"
exit 1
