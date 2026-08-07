// lib/reviews/defaults.ts
// Shared default templates. Kept out of the route file because Next.js route
// modules may only export request handlers.

export const DEFAULT_REVIEW_SMS =
  "Hi {customer_name}, thank you for choosing {business_name}! We'd love your feedback — it only takes 30 seconds: {review_link}"

export const DEFAULT_REVIEW_EMAIL = DEFAULT_REVIEW_SMS

/** app.abconsultingg.com/reviews/{slug} — derived, never stored. */
export const aggregationPageUrl = (slug: string) =>
  `https://app.abconsultingg.com/reviews/${slug}`
