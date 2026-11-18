module.exports = {
  apps: [
    {
      name: "stickystein-index",
      cwd: "/home/sticky/git/stickystein",
      script: "/usr/bin/bash",
      args: "/home/sticky/git/stickystein/scripts/run-local-indexer.sh",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      stop_exit_codes: [0],
      restart_delay: 10000,
      watch: false,
      time: true
    }
  ]
}
