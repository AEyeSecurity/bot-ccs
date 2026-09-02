module.exports = {
  apps: [
    {
      name: "bot-ccs-web",
      script: ".\\node_modules\\next\\dist\\bin\\next",
      args: "start -p 3010",
      cwd: "C:\\BOT CCS",
      interpreter: "node",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
