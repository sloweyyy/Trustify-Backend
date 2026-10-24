# Trustify - Backend [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/sloweyyy/Trustify-Backend)

This repository contains the backend code for **Trustify**, a platform for online notarization services that leverages blockchain and NFT for document storage.

## Pitch Deck

You can view the official Trustify Pitch Deck on Canva:

👉 [View Pitch Deck on Canva](https://www.canva.com/design/DAGnFWahmVs/YdtYLPQEpEvYkGgjJCtqpg/view?utm_content=DAGnFWahmVs&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton)

## Features

- **Document Upload:** Users can upload their documents for notarization.
- **Notary Service Selection:** Users can select from various notary services tailored to their needs.
- **Requester Information:** Users provide personal details for notarization requests.
- **Email Notifications:** Users are kept informed via email about the status of their notarization requests.
- **Firebase Integration:** Securely stores documents on Firebase Cloud Storage.
- **Blockchain & NFT Storage:** Document records are stored securely using blockchain technology and NFTs.
- **Authentication:** Uses JWT-based authentication for secure access.
- **Role-Based Access Control:** Provides different levels of access based on user roles (e.g., admin, customer, notary).
- **Google OAuth:** Allows users to sign in using their Google accounts.
- **Payment Gateway Integration:** Supports online payments for notarization services.
- **Gemini API Integration:** Uses the Gemini API for generating AI-powered documents.
- **VietQR Integration:** Generates QR codes for document verification.
- **API Documentation:** Provides detailed documentation for all APIs using Swagger.
- **Docker Support:** Allows the application to be run in a Docker container.

## Technologies

- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Storage:** Firebase Cloud Storage
- **Authentication:** JWT, Passport.js
- **Validation:** Joi
- **Testing:** Jest
- **Security:** Helmet, Xss-Clean, Express-Mongo-Sanitize
- **Middleware:** Winston (logging), Morgan (HTTP request logging)
- **API Documentation:** Swagger
- **Environment Configuration:** Dotenv, Cross-env
- **Process Management:** PM2
- **Continuous Integration:** Travis CI
- **Code Quality:** Coveralls, Codacy
- **Pre-commit Hooks:** Husky, Lint-staged
- **Code Formatting:** ESLint, Prettier
- **Version Control:** Git
- **Containerization:** Docker
- **Deployment:** Railway

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/sloweyyy/Trustify-Backend
   cd Trustify-Backend
   ```

2. Install dependencies:

   ```bash
   yarn
   ```

3. Set up environment variables:

   Copy the `.env.example` file to `.env` and update the values as needed.

   ```bash
   cp .env.example .env
   ```

4. Start the server:

   ```bash
   yarn start
   ```

## Environment Variables

```bash
# Port number
PORT=3000
HOST=http://localhost

# URL of the Mongo DB
MONGODB_URL=mongodb://127.0.0.1:27017/trustify

# JWT
# JWT secret key
JWT_SECRET=thisisasamplesecret
# Number of minutes after which an access token expires
JWT_ACCESS_EXPIRATION_MINUTES=30
# Number of days after which a refresh token expires
JWT_REFRESH_EXPIRATION_DAYS=30
# Number of minutes after which a reset password token expires
JWT_RESET_PASSWORD_EXPIRATION_MINUTES=10
# Number of minutes after which a verify email token expires
JWT_VERIFY_EMAIL_EXPIRATION_MINUTES=10

# SMTP configuration options for the email service
# For testing, you can use a fake SMTP service like Ethereal: https://ethereal.email/create
SMTP_HOST=email-server
SMTP_PORT=587
SMTP_USERNAME=email-server-username
SMTP_PASSWORD=email-server-password
EMAIL_FROM=support@yourapp.com

# Google OAuth configuration
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=YOUR_GOOGLE_CALLBACK_URL

# GEMINI API key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Firebase configuration
FIREBASE_TYPE=YOUR_FIREBASE_TYPE
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
FIREBASE_PRIVATE_KEY_ID=YOUR_FIREBASE_PRIVATE_KEY_ID
FIREBASE_PRIVATE_KEY=YOUR_FIREBASE_PRIVATE_KEY
FIREBASE_CLIENT_EMAIL=YOUR_FIREBASE_CLIENT_EMAIL
FIREBASE_CLIENT_ID=YOUR_FIREBASE_CLIENT_ID
FIREBASE_AUTH_URI=YOUR_FIREBASE_AUTH_URI
FIREBASE_TOKEN_URI=YOUR_FIREBASE_TOKEN_URI
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=YOUR_FIREBASE_AUTH_PROVIDER_X509_CERT_URL
FIREBASE_CLIENT_X509_CERT_URL=YOUR_FIREBASE_CLIENT_X509_CERT_URL
FIREBASE_UNIVERSE_DOMAIN=YOUR_FIREBASE_UNIVERSE_DOMAIN
FIREBASE_DATABASE_URL=YOUR_FIREBASE_DATABASE_URL

# Client URL
CLIENT_URL=YOUR_CLIENT_URL

# Payment URL
PAYOS_CLIENT_ID=YOUR_PAYOS_CLIENT_ID
PAYOS_API_KEY=YOUR_PAYOS_API_KEY
PAYOS_CHECKSUM_KEY=YOUR_PAYOS_CHECKSUM_KEY
SERVER_URL=YOUR_SERVER_URL
VIETQR_URL=YOUR_VIETQR_URL

# Docker
DOCKER_USERNAME=YOUR_DOCKER_USERNAME
DOCKER_PASSWORD=YOUR_DOCKER_PASSWORD

# Solana
SOLANA_CLUSTER_URL=https://api.devnet.solana.com
WALLET_PRIVATE_KEY=YOUR_BASE64_ENCODED_WALLET_PRIVATE_KEY
PROGRAM_ID=YOUR_SOLANA_PROGRAM_ID

# IPFS/Pinata
PINATA_API_KEY=YOUR_PINATA_API_KEY
PINATA_SECRET_KEY=YOUR_PINATA_SECRET_KEY

# Bundlr
BUNDLR_NODE=https://devnet.bundlr.network
BUNDLR_CURRENCY=solana

```

## QA Environment

| | URL |
|---|---|
| Web app | https://trustify-notary.vercel.app |
| API | https://trustify-api-ar4i.onrender.com (Swagger: `/v1/docs`, health: `/health`) |

QA accounts (created by `yarn seed`, password `Trustify@123`):

| Role | Email |
|---|---|
| Admin | `trustify.admin@example.com` |
| Notary | `trustify.notary@example.com` |
| User | `trustify.user@example.com`, `trustify.user2@example.com` |

The API runs on Render's free plan and sleeps after 15 minutes idle; the first request after that takes about a minute.

## Deployment

All services run on free tiers:

| Piece | Service | Notes |
|---|---|---|
| API | Render web service (`render.yaml`) | Node 20, `node src/index.js`, health check `/health` |
| Database | MongoDB Atlas M0 | Network access `0.0.0.0/0` because Render free has no static IPs |
| Files | Supabase Storage | Public bucket `trustify`; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Web app | Vercel (`Trustify-Frontend/vercel.json`) | Set `REACT_APP_API_BASE_URL` to `<api>/v1` |
| NFTs | Solana devnet | `WALLET_PRIVATE_KEY` = base64 secret key with devnet SOL |

Every integration is optional, so the API also starts with only `MONGODB_URL` and `JWT_SECRET`:

| Missing | Behaviour |
|---|---|
| PayOS keys (or `PAYMENT_MODE=mock`) | Checkout is simulated as paid |
| Supabase / Firebase | Files are written to `./uploads` (lost on Render restarts) |
| Pinata | NFT metadata is stored in file storage |
| SMTP | Emails are logged instead of sent |
| Google OAuth / Gemini | `/v1/auth/google` and `/v1/chatbot` return 503 |

After deploying, seed and run the end-to-end check (needs `PAYMENT_MODE=mock` for the automatic payment step):

```bash
MONGODB_URL=<atlas-url> yarn seed
API_URL=https://<api>/v1 node scripts/smoke-e2e.js
```

## API Documentation

The API documentation can be accessed at `/v1/docs`. You can view the list of available APIs and their specifications by running the server and visiting `http://localhost:3000/v1/docs` in your browser.

## Testing

Run tests with:

```bash
yarn test
```

For coverage reports:

```bash
yarn test --coverage
```

## Docker

If you want to run the application using Docker, you can use the following commands:

```bash
# Run the Docker container in development mode
yarn docker:dev
# Run the Docker container in production mode
yarn docker:prod
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
