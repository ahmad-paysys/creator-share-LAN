# Windows Firewall Setup

Run the following command in an elevated PowerShell terminal to allow incoming LAN traffic to the app port.

```powershell
New-NetFirewallRule -DisplayName "Wedding Photo Share" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
```

If you changed PORT in your .env file, update -LocalPort accordingly.
