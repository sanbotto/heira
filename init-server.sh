#!/bin/bash -xe
exec > >(tee /var/log/userdata.log | logger -t user-data -s 2>/dev/console) 2>&1

# Set hostname
hostnamectl set-hostname heira

# Update the system
apt update
apt upgrade -y

# Add 4GB of swap
dd if=/dev/zero of=/swapfile bs=1MiB count=4096
chmod 600 /swapfile
mkswap /swapfile
echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
systemctl daemon-reload
swapon /swapfile

# Install dependencies
apt install -y net-tools wget git curl vim jq libwww-perl libdatetime-perl unzip
