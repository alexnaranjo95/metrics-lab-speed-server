#!/bin/bash

# Debug instrumentation for git push failure
LOG_FILE="/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log"

# Function to log debug info
log_debug() {
    local hypothesis=$1
    local message=$2
    local data=$3
    local timestamp=$(date +%s%3N)
    local location="debug_git_push.sh:$(caller)"
    
    echo "{\"timestamp\":$timestamp,\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"hypothesisId\":\"$hypothesis\"}" >> "$LOG_FILE"
}

cd /Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server

# Hypothesis A: Git configuration issues
log_debug "A" "Testing git configuration" "{\"remotes\":\"$(git remote -v 2>&1 | tr '\n' ';')\",\"branch\":\"$(git branch --show-current 2>&1)\"}"

# Hypothesis B: Git state/lock issues  
log_debug "B" "Checking git state" "{\"status\":\"$(git status --porcelain 2>&1 | wc -l)\",\"locks\":\"$(ls -la .git/*.lock .git/refs/heads/*.lock 2>/dev/null | wc -l)\"}"

# Hypothesis C: Authentication setup
log_debug "C" "Testing SSH/auth setup" "{\"ssh_agent\":\"$(ssh-add -l 2>&1 | head -1)\",\"git_config_user\":\"$(git config user.email 2>&1)\"}"

# Hypothesis D: Network connectivity to remote
log_debug "D" "Testing network connectivity" "{\"ping_github\":\"$(ping -c 1 github.com 2>&1 | grep 'packets transmitted' || echo 'failed')\"}"

# Hypothesis E: Remote repository access
REMOTE_URL=$(git remote get-url origin 2>&1)
log_debug "E" "Testing remote access" "{\"remote_url\":\"$REMOTE_URL\",\"can_fetch\":\"$(timeout 10 git ls-remote origin HEAD 2>&1 | head -1 || echo 'timeout_or_error')\"}"

echo "Debug instrumentation complete. Check debug.log for results."