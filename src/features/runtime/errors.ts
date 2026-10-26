// Greek, player-safe error messages. Pure. Technical detail never reaches the player; it is logged server-side (redacted).
export type ErrorCode =
  | 'session_create_failed' | 'pair_failed' | 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'already_paired'
  | 'no_session' | 'unauthorized' | 'forbidden' | 'bad_origin' | 'rate_limited' | 'realtime_lost' | 'action_failed'
  | 'conflict' | 'invalid_action' | 'invalid_answer' | 'asset_missing' | 'story_invalid' | 'story_unavailable'
  | 'db_timeout' | 'admin_unauthorized' | 'upload_failed' | 'server_config' | 'unknown';

export const MESSAGES_EL: Record<ErrorCode, string> = {
  session_create_failed: 'Η δημιουργία παιχνιδιού απέτυχε. Προσπάθησε ξανά.',
  pair_failed: 'Η σύνδεση απέτυχε. Προσπάθησε ξανά.',
  invalid_code: 'Ο κωδικός σύνδεσης δεν είναι σωστός.',
  expired_code: 'Ο κωδικός έχει λήξει. Ζήτησε νέο από την οθόνη.',
  too_many_attempts: 'Πολλές αποτυχημένες προσπάθειες. Ζήτησε νέο κωδικό από την οθόνη.',
  already_paired: 'Υπάρχει ήδη συνδεδεμένο χειριστήριο.',
  no_session: 'Το παιχνίδι δεν βρέθηκε ή έχει λήξει.',
  unauthorized: 'Η σύνδεση δεν είναι πλέον έγκυρη. Συνδέσου ξανά.',
  forbidden: 'Δεν επιτρέπεται.',
  bad_origin: 'Μη έγκυρο αίτημα.',
  rate_limited: 'Πάρα πολλές προσπάθειες. Περίμενε λίγο και δοκίμασε ξανά.',
  realtime_lost: 'Χάθηκε η σύνδεση. Γίνεται επανασύνδεση…',
  action_failed: 'Η ενέργεια απέτυχε. Προσπάθησε ξανά.',
  conflict: 'Το παιχνίδι άλλαξε. Προσπάθησε ξανά.',
  invalid_action: 'Μη έγκυρη ενέργεια.',
  invalid_answer: 'Η απάντηση δεν είναι έγκυρη.',
  asset_missing: 'Δεν φορτώθηκε μια εικόνα ή ένας ήχος. Το παιχνίδι συνεχίζεται.',
  story_invalid: 'Το περιεχόμενο της ιστορίας δεν είναι έγκυρο.',
  story_unavailable: 'Η ιστορία δεν είναι ακόμη διαθέσιμη.',
  db_timeout: 'Η υπηρεσία αργεί να απαντήσει. Προσπάθησε ξανά σε λίγο.',
  admin_unauthorized: 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.',
  upload_failed: 'Η μεταφόρτωση απέτυχε. Έλεγξε το αρχείο και δοκίμασε ξανά.',
  server_config: 'Η υπηρεσία δεν είναι διαθέσιμη.',
  unknown: 'Κάτι πήγε στραβά. Προσπάθησε ξανά.',
};

export const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_code: 400, invalid_action: 400, invalid_answer: 400, unauthorized: 401, admin_unauthorized: 403, forbidden: 403, bad_origin: 403,
  no_session: 404, expired_code: 410, conflict: 409, already_paired: 409, story_unavailable: 409, rate_limited: 429, too_many_attempts: 429,
  session_create_failed: 500, pair_failed: 500, action_failed: 500, server_config: 500, db_timeout: 504, upload_failed: 400,
};

export const isErrorCode = (c: unknown): c is ErrorCode => typeof c === 'string' && c in MESSAGES_EL;

/** Only a known code and its fixed Greek text can leave the server. Error objects, stacks and SQL text are never forwarded. */
export function publicError(code: unknown): { code: ErrorCode; message: string; status: number } {
  const c: ErrorCode = isErrorCode(code) ? code : 'unknown';
  return { code: c, message: MESSAGES_EL[c], status: HTTP_STATUS[c] ?? 500 };
}

/** Maps a thrown/DB error to a safe code without leaking its text. */
export function classifyThrown(e: unknown): ErrorCode {
  const msg = String((e as { message?: unknown })?.message ?? e ?? '').toLowerCase();
  if (/timeout|timed out|canceling statement/.test(msg)) return 'db_timeout';
  if (/stale_draft/.test(msg)) return 'conflict';
  return 'unknown';
}
