#!/bin/bash
sleep 1
/usr/bin/udisksctl mount -b /dev/$1 --no-user-interaction >> /var/log/kiosk-mount.log 2>&1
