# Firebase Setup Guide for APPARATUS

Follow these steps to create your Firebase project, enable authentication, database persistence, and prepare the project for deployment.

---

## Step 1: Create a Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Create a project** (or **Add project**).
3. Enter your project name (e.g. `apparatus-training`) and click **Continue**.
4. Disable Google Analytics for this project (not needed) and click **Create project**.
5. Wait for the setup to complete and click **Continue**.

---

## Step 2: Enable Firestore Database
1. In the left-hand menu of your Firebase Console, click on **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Select a location close to you and click **Next**.
4. Choose **Start in test mode** (this allows you to read/write quickly for testing).
   > [!IMPORTANT]
   > Test mode allows anyone to read/write your database for 30 days. When you are ready for production, update your Rules tab to:
   > ```javascript
   > rules_version = '2';
   > service cloud.firestore {
   >   match /databases/{database}/documents {
   >     match /users/{userId} {
   >       allow read, write: if request.auth != null && request.auth.uid == userId;
   >     }
   >   }
   > }
   > ```
5. Click **Create** (or **Enable**).

---

## Step 3: Enable Google Authentication
1. In the left-hand menu, click on **Build** -> **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, click **Add new provider** and select **Google**.
4. Click the toggle to **Enable** Google Auth.
5. Choose a project support email (your Gmail account) from the dropdown.
6. Click **Save**.

---

## Step 4: Get Your Firebase Credentials
1. Click the **Gear Icon** (Settings) next to "Project Overview" in the top-left sidebar and select **Project settings**.
2. Under the **General** tab, scroll down to the "Your apps" section and click the **Web icon** (`</>`).
3. Enter an app nickname (e.g., `Apparatus Web`) and click **Register app**. (Do *not* check Firebase Hosting yet).
4. You will see a script block containing `const firebaseConfig = { ... }`.
5. Copy the fields inside that `firebaseConfig` object. They look like this:
   ```javascript
   apiKey: "AIzaSy...",
   authDomain: "apparatus-training.firebaseapp.com",
   projectId: "apparatus-training",
   storageBucket: "apparatus-training.appspot.com",
   messagingSenderId: "1234567890",
   appId: "1:12345..."
   ```
6. Open your local [js/firebase-config.js](file:///c:/Users/Tms/Desktop/apparatus/js/firebase-config.js) file and replace the placeholder text with your copied values!

---

## Step 5: How to Deploy to Firebase Hosting
Once your app works locally with sync, you can publish it to the internet:

1. Install the Firebase Command Line Tool (if you haven't already):
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to your Firebase account in the terminal:
   ```bash
   firebase login
   ```
3. Initialize hosting in your project folder:
   ```bash
   firebase init hosting
   ```
   - Select **Use an existing project**.
   - Choose the project you created in Step 1.
   - For public directory, type `.` (just a period, meaning the current directory).
   - Configure as a single-page app? Type `y` (yes).
   - Set up automatic builds and deploys with GitHub? Type `n` (no).
   - Overwrite `apparatus.html`? Type `N` (NO! Very important, don't let it overwrite your file!).
4. Deploy the app:
   ```bash
   firebase deploy
   ```
5. Firebase will print your hosting URL (e.g., `https://apparatus-training.web.app`). You can open it on any phone or laptop and sign in to sync your exercises!
