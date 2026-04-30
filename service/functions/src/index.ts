import { initializeApp } from "firebase-admin/app";

initializeApp();

// Function exports are added by other units:
//   Unit 3 → ./auth         (signupOrLogin, exchangeFirebaseToken)
//   Unit 4 → ./proxy        (chatCompletions)
//   Unit 5 → ./scheduled/quotaReset
