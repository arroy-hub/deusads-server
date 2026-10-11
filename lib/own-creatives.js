// What the developer's own pictures (shown on a placement when no advertiser is booked) are allowed to be.
// Shared by the server actions and the placement card, so both say the same thing.

/** Most own pictures one placement can hold. The database enforces the same number (migration 0020). */
export const MAX_OWN_CREATIVES = 5;

export const OWN_PICTURE_TYPES = { "image/png": "png", "image/jpeg": "jpg" };
export const OWN_PICTURE_MAX_BYTES = 8 * 1024 * 1024;
