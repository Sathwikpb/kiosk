# 🖥️ Kiosk - Raspberry Pi Application

Welcome to the Kiosk project! This is a robust, auto-starting kiosk application designed to run on a Raspberry Pi. It is built with Node.js and uses PM2 for process management to ensure high availability and automatic recovery after system reboots.

##  Tech Stack

* **Platform:** Raspberry Pi
* **Backend:** Node.js
* **Process Manager:** PM2
* **Version Control:** Git & GitHub

## 📁 Project Structure

* `public/`: Front-end assets (HTML, CSS, client-side JavaScript, images).
* `files/`: Static documents and assets (e.g., PDFs).
* `server.js`: The main backend application logic, API endpoints, and routing.
* `package.json`: Project dependencies and configuration.

## 🛠️ Getting Started

If you are a new developer looking to contribute, please check out our detailed **Contributing Guide** for step-by-step instructions on setting up your local environment, creating SSH keys, and submitting pull requests.

### Prerequisites

* Node.js (v24.x recommended)
* Git

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:Sathwikpb/kiosk.git
    cd kiosk
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the local development server:**
    ```bash
    node server.js
    ```

## 🍓 Raspberry Pi Deployment

The application is deployed on a Raspberry Pi and managed by PM2, which automatically restarts the kiosk service on system reboots.

### Updating the Production Application

1.  SSH into the Raspberry Pi:
    ```bash
    ssh pi@<IP_ADDRESS>
    ```
2.  Navigate to the project directory:
    ```bash
    cd ~/kiosk
    ```
3.  Pull the latest changes from the main branch:
    ```bash
    git pull origin main
    ```
4.  Install any new dependencies:
    ```bash
    npm install
    ```
5.  Restart the application using PM2:
    ```bash
    pm2 restart kiosk
    ```

### Useful PM2 Commands

* `pm2 list` - Check the status and memory usage of the application
* `pm2 logs kiosk` - View live application logs and error outputs
* `pm2 monit` - Monitor CPU and memory usage in real-time
* `pm2 save` - Save the current process list to persist across reboots

## 🔒 Security Guidelines

* Never commit `.env` files to the repository.
* Do not commit the `node_modules/` directory.
* Avoid adding very large files directly to Git history.
