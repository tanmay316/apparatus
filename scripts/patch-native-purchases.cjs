/**
 * Patches @capgo/native-purchases (Android) so a subscription purchase charges exactly the plan the app showed.
 *
 * Upstream purchaseProduct() ignores `offerToken` for subscriptions, takes the first offer of the base plan
 * (which can be a different promo/intro offer) and, if the base plan isn't found, silently buys the FIRST plan
 * of the product instead - so the user can be charged for a different plan and price than they picked.
 * Patched: use the given offerToken, else the plan's base offer, and refuse instead of buying another plan.
 * Runs on `npm install` (postinstall) and in build-apk.bat. Idempotent.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'node_modules', '@capgo', 'native-purchases', 'android', 'src', 'main', 'java',
  'ee', 'forgr', 'nativepurchases', 'NativePurchasesPlugin.java',
);
const MARKER = '// apparatus-patch: exact subscription offer';

if (!fs.existsSync(file)) {
  console.log('patch-native-purchases: plugin not installed, skipping');
  process.exit(0);
}

const src = fs.readFileSync(file, 'utf8');
if (src.includes(MARKER)) {
  console.log('patch-native-purchases: already patched');
  process.exit(0);
}

const original = /([ \t]*)for \(ProductDetails\.SubscriptionOfferDetails offerDetails : productDetailsItem\.getSubscriptionOfferDetails\(\)\) \{\s*Log\.d\(TAG, "Checking offer: " \+ offerDetails\.getBasePlanId\(\)\);\s*if \(offerDetails\.getBasePlanId\(\)\.equals\(planIdentifier\)\) \{\s*selectedOfferDetails = offerDetails;\s*Log\.d\(TAG, "Found matching plan: " \+ planIdentifier\);\s*break;\s*\}\s*\}\s*if \(selectedOfferDetails == null\) \{\s*selectedOfferDetails = productDetailsItem\.getSubscriptionOfferDetails\(\)\.get\(0\);\s*Log\.d\(TAG, "Using first available offer: " \+ selectedOfferDetails\.getBasePlanId\(\)\);\s*\}/;

const match = src.match(original);
if (!match) {
  console.error('patch-native-purchases: purchaseProduct() code changed upstream; update scripts/patch-native-purchases.cjs');
  process.exit(1);
}

const i = match[1];
const patched = [
  `${i}${MARKER}`,
  `${i}for (ProductDetails.SubscriptionOfferDetails offerDetails : productDetailsItem.getSubscriptionOfferDetails()) {`,
  `${i}    if (!offerDetails.getBasePlanId().equals(planIdentifier)) continue;`,
  `${i}    if (offerToken != null && !offerToken.isEmpty()) {`,
  `${i}        if (offerToken.equals(offerDetails.getOfferToken())) {`,
  `${i}            selectedOfferDetails = offerDetails;`,
  `${i}            break;`,
  `${i}        }`,
  `${i}    } else if (offerDetails.getOfferId() == null) {`,
  `${i}        selectedOfferDetails = offerDetails;`,
  `${i}        break;`,
  `${i}    }`,
  `${i}}`,
  `${i}if (selectedOfferDetails == null) {`,
  `${i}    Log.d(TAG, "Plan/offer not available: " + planIdentifier);`,
  `${i}    closeBillingClient();`,
  `${i}    call.reject("This plan isn't available on Google Play right now. Please reopen the page and try again.");`,
  `${i}    return;`,
  `${i}}`,
  `${i}Log.d(TAG, "Selected plan " + selectedOfferDetails.getBasePlanId() + " offer " + selectedOfferDetails.getOfferId());`,
].join('\n');

fs.writeFileSync(file, src.replace(original, patched), 'utf8');
console.log('patch-native-purchases: patched purchaseProduct() to buy the exact plan/offer');
