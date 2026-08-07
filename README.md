# CareCycle

CareCycle is a full-stack medical-equipment donation platform that connects individual donors with verified NGOs. It provides secure role-based accounts, protected equipment listings, NGO verification, donation requests, donor matching, and a separate CareCycle Administration portal.

![CareCycle interface showcase](docs/screenshots/carecycle-showcase.gif)

> The animated showcase cycles through the current participant login, home, about, and donation-listing interfaces. Individual full-resolution screenshots are available in [`docs/screenshots`](docs/screenshots).

## Current release

**Version:** `0.6.0-alpha.2`

Implemented release stages:

- `0.1` — security and stability foundation
- `0.2` — modular backend and database models
- `0.3` — donor listing workflow and protected images
- `0.4A–0.4C` — roles, authorization, NGO onboarding, and verification evidence
- `0.4D–0.4F` — equipment discovery, NGO requests, donor matching, and controlled contact exchange
- `0.5` — responsive and accessible interface
- `0.6A–0.6A.1` — CareCycle Administration, moderation, audit history, and separated login realms

## Participant experiences

### Donors

- Register and sign in through the participant portal
- Create medical-equipment listings with condition, quantity, location, description, and up to three images
- Edit or withdraw available listings
- Review requests from verified NGOs
- Accept or reject pending requests
- Track allocated quantities and matching history
- Exchange contact information only after accepting a request

### NGO members

- Register through the participant portal
- Submit an organization profile and private verification document
- Correct and resubmit rejected applications
- Browse available equipment after verification
- Filter equipment by type, condition, city, state, or postal code
- Submit bounded equipment requests with beneficiary and need information
- Cancel pending requests and review request history
- Receive donor contact information only after an accepted match

### CareCycle Administration

- Use a separate authentication realm at `/admin/login`
- Review private NGO verification evidence
- Approve or reject NGO applications
- Suspend or reactivate donor and NGO accounts
- Review operational metrics and administrative audit records
- Review administration-access requests before securely provisioning accounts

CareCycle Administration is an internal platform role. It is not a government or ministry portal, and administrator accounts cannot be created through public registration.

## Technology

- Node.js and Express
- MongoDB and Mongoose
- EJS and CSS
- JWT authentication
- Bcrypt password hashing
- Express sessions and CSRF protection
- Multer uploads with MIME and file-signature validation
- Nodemailer-ready notification service
- Node.js built-in test runner

## Security controls

- Separate participant and CareCycle Administration login realms
- Server-enforced donor, NGO, and administrator roles
- Resource-ownership middleware
- Verified-organization middleware
- HTTP-only authentication cookies
- Session-bound CSRF tokens
- Authentication and action rate limiting
- Suspended-account enforcement
- Private verification documents and donation images
- File size, count, MIME-type, and binary-signature validation
- Conditional quantity reservation to prevent over-allocation
- Administrative audit records
- No public administrator registration

## Project structure

```text
CareCycle-main/
├── index.js
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── validators/
├── views/
│   └── partials/
├── public/
├── scripts/
├── tests/
├── docs/screenshots/
└── uploads/                 # Runtime files; ignored by Git
```

## Run locally with PowerShell

Requirements:

- Node.js
- MongoDB Community Server or a reachable MongoDB deployment
- MongoDB Compass is optional

```powershell
cd "C:\Users\244234\Desktop\CareCycle-main"
npm install
```

Create a `.env` file:

```env
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=CareCycle
JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-another-different-random-secret
APP_URL=http://localhost:4000
```

Start MongoDB and CareCycle:

```powershell
Start-Service MongoDB
npm start
```

Open [http://localhost:4000](http://localhost:4000).

## Provision a CareCycle administrator

Administrator accounts are provisioned deliberately rather than publicly registered:

```powershell
$env:ADMIN_NAME="CareCycle Administrator"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="Choose-A-Strong-Password-2026"
npm run seed:admin
$env:ADMIN_NAME=$null
$env:ADMIN_EMAIL=$null
$env:ADMIN_PASSWORD=$null
```

Then sign in at [http://localhost:4000/admin/login](http://localhost:4000/admin/login).

## Testing

```powershell
npm test
```

The test suite covers input validation, role separation, ownership, verified-organization access, matching capacity, model contracts, and EJS rendering.

## Screenshot gallery

| Participant login | Home | Donation form |
|---|---|---|
| ![Participant login](docs/screenshots/01-participant-login.png) | ![Home hero](docs/screenshots/02-home-hero.png) | ![Donation form](docs/screenshots/07-donation-form.png) |

| How it works | About CareCycle | Mission |
|---|---|---|
| ![How CareCycle works](docs/screenshots/03-how-it-works.png) | ![About CareCycle](docs/screenshots/05-about-hero.png) | ![CareCycle mission](docs/screenshots/06-about-mission.png) |

## Planned work

- Release `0.6B`: notifications and NGO acknowledgement
- Release `0.7`: pickup, handover, expenses, inventory, and outcome reporting
- Release `0.8`: multi-member NGO accounts and granular organization permissions
- Release `0.9`: operational analytics and report exports
- Release `1.0`: managed infrastructure, deployment, monitoring, backups, and production security
- Post-`1.0`: separate government or departmental oversight portal

## Important note

CareCycle is currently a functional development prototype. Production use involving real organizations, contact information, beneficiary data, or medical equipment requires a privacy review, legal and regulatory assessment, operational safety procedures, managed infrastructure, and independent security testing.
