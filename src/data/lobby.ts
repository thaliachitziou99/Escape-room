import type { Hotspot } from '../features/controller/hotspots.ts';

export const LOBBY_SCENE_ID = 'nocturne-lobby';
const s = LOBBY_SCENE_ID;

export const LOBBY_HOTSPOTS: Hotspot[] = [
  { id: 'reception-desk', sceneId: s, x: 0.08, y: 0.5, width: 0.3, height: 0.25, priority: 1, enabled: true, label: 'Γραφείο υποδοχής', description: 'Το παλιό ξύλινο γραφείο είναι καλυμμένο με σκόνη.' },
  { id: 'guest-book', sceneId: s, x: 0.16, y: 0.5, width: 0.1, height: 0.07, priority: 2, enabled: true, label: 'Βιβλίο εγγραφών', description: 'Το όνομα Adrian Vale εμφανίζεται στην τελευταία καταχώρηση.' },
  { id: 'wall-clock', sceneId: s, x: 0.46, y: 0.1, width: 0.1, height: 0.16, priority: 1, enabled: true, label: 'Ρολόι τοίχου', description: 'Οι δείκτες έχουν σταματήσει στις 11:47.' },
  { id: 'locked-cabinet', sceneId: s, x: 0.62, y: 0.38, width: 0.14, height: 0.3, priority: 1, enabled: true, label: 'Κλειδωμένο ντουλάπι', description: 'Το ντουλάπι είναι κλειδωμένο. Χρειάζεται τετραψήφιος κωδικός.' },
  { id: 'corridor-door', sceneId: s, x: 0.82, y: 0.25, width: 0.14, height: 0.5, priority: 1, enabled: true, label: 'Πόρτα διαδρόμου', description: 'Η πόρτα είναι κλειδωμένη. Χρειάζεσαι ένα κλειδί.' },
];
