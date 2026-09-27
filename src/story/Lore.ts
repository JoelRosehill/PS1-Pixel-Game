/**
 * The story of Chromatic Odyssey (Jobs 9, 16), told the Elden Ring way: in fragments beside
 * the Long Road, in the kneeling dead, in what the eight great foes leave behind, and in
 * what Oswin the Wanderer is willing to say as he waits for you further along the road.
 *
 * The spine. Queen Liriel died at dawn. Her husband Maelor, the Pale Sovereign, could not
 * bear another dawn to come, so he had Oswin the Chainwright forge a chain from the oaths
 * of his knights and bound the moon above the Dawnspire, where it has hung for four
 * hundred years. Night never ended; the sun's order went blind, the sun's dragon was
 * chained, and eight great servants each hold a Link of the Chain. The Emberwardens kept
 * the last fires burning along the Long Road. Isolde of Hollowmere wrote the Chromatic
 * Codex, a book of every colour the night had stolen, and walked east to break the Chain;
 * she tore the pages out and hid them along the road so Maelor's knights could not take
 * them all. Her sister Wren — you — wakes in burned Hollowmere, the last Emberwarden.
 */

export interface LoreFragment {
  id: string;
  title: string;
  text: string;
  /** 1–8, the chapter it belongs to (0 = the prologue). */
  chapter: number;
}

export interface Remembrance {
  id: string;
  /** Boss id that leaves it. */
  boss: string;
  name: string;
  text: string;
  /** What it gives: a Sword Art, more vigour (max health), another Ember Flask. */
  art?: string;
  vigour?: number;
  flask?: number;
}

export interface ChapterArc {
  chapter: number;
  title: string;
  text: string;
}

/** Shown once when a new journey begins. */
export const PROLOGUE: LoreFragment = {
  id: 'prologue', chapter: 0, title: 'The Long Night',
  text: 'Four hundred years ago Queen Liriel died as the sun came up, and King Maelor swore that no dawn would ever come again. '
    + 'He chained the moon above the Dawnspire. It has not moved since. Your sister Isolde wrote a book of every colour the night took '
    + 'and walked the Long Road east to break the Chain. She did not come back. Last night the Moon-knights burned Hollowmere. '
    + 'You are the last Emberwarden. The fire is still lit. The road begins at your door.',
};

/** One fragment per biome, keyed by site id (`c<chapter>-<slot>`), in road order. */
export const LORE: Record<string, LoreFragment> = {
  // --- Chapter I · The Hollow Reach ---------------------------------------------------
  'c1-0': { id: 'c1-0', chapter: 1, title: 'Scorched into the village sign',
    text: 'HOLLOWMERE. Someone has cut beneath it, fresh: "Isolde went east with the book. Wren — follow the road. Keep the fire."' },
  'c1-1': { id: 'c1-1', chapter: 1, title: 'A page of Isolde’s, pinned to a pine',
    text: 'The pines here never lose their needles, so they never learned that time was passing. I envy them. I have torn the first page out and hidden it on the watch stone. If you are reading this, little sister, climb.' },
  'c1-2': { id: 'c1-2', chapter: 1, title: 'A child’s drawing, weighted by a stone',
    text: 'Two moons over a lake: one in the sky, one in the water. Only the one in the water is silver. Underneath, in careful letters: "the real one".' },
  'c1-3': { id: 'c1-3', chapter: 1, title: 'Burial register of St Aldric',
    text: 'Emberwardens interred this year: forty. Emberwardens who stayed interred: none. The Gravewarden has been asked to dig deeper.' },
  'c1-4': { id: 'c1-4', chapter: 1, title: 'Order nailed to the Highpine Wall',
    text: 'By command of the Sovereign: the gate is closed to all who carry fire. The Gravewarden holds the First Link. Let the dead keep the road.' },

  // --- Chapter II · The Violet Fen -----------------------------------------------------
  'c2-0': { id: 'c2-0', chapter: 2, title: 'A lantern-keeper’s tally',
    text: 'Lanterns lit for the drowned tonight: one thousand and six. Lanterns answered: none. I will light one more. It costs nothing to be wrong kindly.' },
  'c2-1': { id: 'c2-1', chapter: 2, title: 'Inscription on the drowned stones',
    text: 'Here the Moon-kings were crowned, standing in the water so the moon would see herself behind them. The water still remembers. That is why it glows.' },
  'c2-2': { id: 'c2-2', chapter: 2, title: 'Hymn-sheet from the drowned chapel',
    text: 'Hush now, the moon is watching, / Hush now, she cannot leave, / We tied her to the tower / So none of us would grieve. (The last line has been scratched out, and rewritten: "So only one would grieve.")' },
  'c2-3': { id: 'c2-3', chapter: 2, title: 'A warning in wisp-light',
    text: 'The lights here are the fen’s memory of lanterns. Follow one and it will follow you home. Isolde followed three; they led her true.' },
  'c2-4': { id: 'c2-4', chapter: 2, title: 'Chalk on the drowned circle',
    text: 'Gloomhorn carried the drowned to the shore for a thousand years. Then the moon wept into the fen, and it drank, and it has been carrying them the other way since. It holds the Second Link, in its horn.' },

  // --- Chapter III · The Sunkeepers’ Coast -----------------------------------------------
  'c3-0': { id: 'c3-0', chapter: 3, title: 'Dedication of the Temple of the Low Sun',
    text: 'To the sun, who rose every morning without once being asked. We keep this temple so that she knows where to come back to.' },
  'c3-1': { id: 'c3-1', chapter: 3, title: 'Water-clock inscription',
    text: 'The water falls a finger’s width each hour. It has filled the lower terraces and the sea. By the Keepers’ count it is now the four hundredth year, eleventh hour, of the night.' },
  'c3-2': { id: 'c3-2', chapter: 3, title: 'Coral-stone tablet',
    text: 'When the sun did not come back, Solenne made one. She hung it over the temple and told us it was real. When she could no longer bear to look at the lie, she put out her own eyes. We still pray to it. It is warm, at least.' },
  'c3-3': { id: 'c3-3', chapter: 3, title: 'Gardener’s ledger',
    text: 'Heliotropes turned toward the false sun: all of them. Toward the moon: one. I have not had the heart to pull it up. Isolde asked for a cutting.' },
  'c3-4': { id: 'c3-4', chapter: 3, title: 'Beneath the kept sun',
    text: 'Solenne, Blind Sunkeeper, holds the Third Link: the Link of Light. She believes the Chain keeps the world from seeing the dark. She is not entirely wrong.' },

  // --- Chapter IV · The Crystal Deep -------------------------------------------------------
  'c4-0': { id: 'c4-0', chapter: 4, title: 'Frost-scratched warning',
    text: 'The Prism Choir sang the colours back into the world, one note for each. Then the Glutton came up from below. Do not sing here.' },
  'c4-1': { id: 'c4-1', chapter: 4, title: 'Engraved on the Singing Hall',
    text: 'Red was the first note and violet the last. Between them, every colour a morning can hold. The choir is gone. The crystals still hum the scale, without the words.' },
  'c4-2': { id: 'c4-2', chapter: 4, title: 'Miner’s letter, unsent',
    text: 'Love — the rose quartz here is warm, like a hand. The foreman says it is the Choir, still inside the Glutton, singing. I do not go down to the lower galleries any more.' },
  'c4-3': { id: 'c4-3', chapter: 4, title: 'Chalk on the geode wall, in Isolde’s hand',
    text: 'The Codex needs every colour. The Glutton ate the Choir, so the Glutton has the colours. It holds the Fourth Link too. I am not strong enough. Maybe the next one will be.' },
  'c4-4': { id: 'c4-4', chapter: 4, title: 'Echo-stone',
    text: 'Speak your name into the stone and it answers in the voice of the last person who did. It says, in your sister’s voice: "Wren. Keep going."' },

  // --- Chapter V · The Bloodstone Wastes ---------------------------------------------------
  'c5-0': { id: 'c5-0', chapter: 5, title: 'Plaque at the canyon mouth',
    text: 'Here the war on the sun was fought, in one afternoon, by one king, against one dragon. The stone has been red since.' },
  'c5-1': { id: 'c5-1', chapter: 5, title: 'Graffiti beneath the Crimson Pavilion',
    text: 'THEY HANGED THE LAST SUNKEEPERS HERE. THE PAVILION WAS BUILT OVER THEM SO THE KING WOULD NOT HAVE TO SEE. WE SEE.' },
  'c5-2': { id: 'c5-2', chapter: 5, title: 'Oath carved into a spire',
    text: 'By this blade and this dark I swear: no light shall pass the Red Keep while the Sovereign mourns. (Beneath, a knight’s name, and the words "I am so tired".)' },
  'c5-3': { id: 'c5-3', chapter: 5, title: 'Ossuary register',
    text: 'Remains catalogued: eleven thousand. Remains of dragon-hunters: all of them. Remains of the dragon: none. It is still up there.' },
  'c5-4': { id: 'c5-4', chapter: 5, title: 'Inscription over the Red Keep’s gate',
    text: 'Vermilion, the sun’s own dragon, whose fire the Sovereign took and chained here, holds the Fifth Link. It does not guard the Keep. It is kept in it.' },

  // --- Chapter VI · The Knight’s March -----------------------------------------------------
  'c6-0': { id: 'c6-0', chapter: 6, title: 'Scorched decree',
    text: 'Every knight of the March shall swear upon the Chain. The oaths shall be taken from them and worked into iron. — by the Sovereign’s hand, witnessed by the Chainwright.' },
  'c6-1': { id: 'c6-1', chapter: 6, title: 'Carved on the Oathblade',
    text: 'When the knights gave their oaths to the Chain they had nothing left to swear by, so they planted their swords and left them. The swords grew. Oaths do that, unkept.' },
  'c6-2': { id: 'c6-2', chapter: 6, title: 'Marsh-keeper’s complaint',
    text: 'The water here is warm and it should not be. Something under the March is still burning from the war. Nobody will come and look.' },
  'c6-3': { id: 'c6-3', chapter: 6, title: 'Charcoal-rubbing of a ring',
    text: 'CADDOC, FIRST TO SWEAR. The ring’s owner rode out against the last dawn alone, and turned it back. He has been riding against it ever since.' },
  'c6-4': { id: 'c6-4', chapter: 6, title: 'Nailed to the moat bridge',
    text: 'Sir Caddoc, the Last Charge, holds the Sixth Link: the Link of Oaths. He will not stop. He does not know how.' },

  // --- Chapter VII · The Dreaming Wastes -----------------------------------------------------
  'c7-0': { id: 'c7-0', chapter: 7, title: 'Lamp-keeper’s oath',
    text: 'I will keep this lamp until morning. (Below, many times, in different hands, each fainter than the last: "Still keeping it.")' },
  'c7-1': { id: 'c7-1', chapter: 7, title: 'Scratched on the fallen glass',
    text: 'Old gods of glass and plastic, from a world before this one. They remember a light that came from inside them. Isolde left something on the great keyboard — the one thing she could not carry any further.' },
  'c7-2': { id: 'c7-2', chapter: 7, title: 'Words on the Bard’s Rest',
    text: 'He sang the moon a song so long she stayed to hear the end of it. He lay down in the song to rest. We are still waiting for the last verse.' },
  'c7-3': { id: 'c7-3', chapter: 7, title: 'An orchard-keeper’s note',
    text: 'The bees of the orchard carry sleep, not pollen. The Queen keeps the whole world dreaming so nobody notices how long the night has been. Wake up. WAKE UP.' },
  'c7-4': { id: 'c7-4', chapter: 7, title: 'Wax seal on the Hive',
    text: 'The Hive Queen holds the Seventh Link: the Link of Dreams. Beyond her, the Dawnspire. Beyond that, nothing but the moon.' },

  // --- Chapter VIII · The Dawnspire ----------------------------------------------------------
  'c8-0': { id: 'c8-0', chapter: 8, title: 'The gardener’s promise',
    text: 'Liriel planted this garden to watch the sun come up. Maelor keeps it exactly as it was that morning. Nothing ends here. Nothing blooms.' },
  'c8-1': { id: 'c8-1', chapter: 8, title: 'A root of starlight',
    text: 'Stars fell here, and grew roots, because there was no morning to fade them. Isolde wrote: "Even the stars are tired. Hurry."' },
  'c8-2': { id: 'c8-2', chapter: 8, title: 'Coronation stone, the Pale Cathedral',
    text: 'Here Liriel was crowned, at dawn, as queens of the Long Road always were. Here she died, at dawn, forty years later. Maelor painted the cathedral white so it would never again look golden in the morning.' },
  'c8-3': { id: 'c8-3', chapter: 8, title: 'Links, underfoot',
    text: 'The Chain Road is paved with spare links. Each one is stamped with a knight’s name and the oath that was taken from him. Oswin’s mark is on every one.' },
  'c8-4': { id: 'c8-4', chapter: 8, title: 'At the foot of the Dawnspire',
    text: 'Maelor holds the Last Link himself. He does not want to keep the moon. He wants to keep the morning from coming, because the last morning took her.' },
};

/** The kneeling dead: one Emberwarden per chapter, the last of them your sister. */
export const MEMORIALS: Record<number, LoreFragment> = {
  1: { id: 'mem-1', chapter: 1, title: 'An Emberwarden, kneeling', text: 'Her sword is planted in a fire that went out long ago. She is still holding it.' },
  2: { id: 'mem-2', chapter: 2, title: 'An Emberwarden, half sunk', text: 'He waded in to carry a lantern to the drowned. The lantern is still lit.' },
  3: { id: 'mem-3', chapter: 3, title: 'An Emberwarden among the heliotropes', text: 'She shaded her eyes against the kept sun. Her hand is still raised; she knew it was false and looked anyway.' },
  4: { id: 'mem-4', chapter: 4, title: 'An Emberwarden, frozen at rest', text: 'He sat down to warm his hands at a crystal. The crystal is warm. He is not.' },
  5: { id: 'mem-5', chapter: 5, title: 'An Emberwarden facing the Red Keep', text: 'Her armour is scorched from the front. She never turned her back on the dragon.' },
  6: { id: 'mem-6', chapter: 6, title: 'An Emberwarden in the ash', text: 'He carried an ember all the way from the deep fire. It went out in his hands, one step from here.' },
  7: { id: 'mem-7', chapter: 7, title: 'An Emberwarden, dreaming', text: 'She lay down in the orchard to rest for a moment. She is smiling. Whatever she is dreaming, it is morning there.' },
  8: { id: 'mem-8', chapter: 8, title: 'Isolde',
    text: 'Your sister, kneeling on the Chain Road, her sword planted, her book gone — its last page is in your hand now. She got further than anyone. The frost on her helm is shaped like a sunrise.' },
};

/** What the great foes leave behind; each also frees a Link of the Chain. */
export const REMEMBRANCES: Remembrance[] = [
  { id: 'rem-morrow', boss: 'morrow', name: 'Remembrance of the Gravewarden', art: 'art-tempest', vigour: 10,
    text: 'A grave-bell’s clapper. Morrow buried every Emberwarden who fell on the road, and dug them up again when the Sovereign asked. The First Link is broken; St Aldric’s dead can rest. Their last fury is yours: Tempest Cross.' },
  { id: 'rem-gloomhorn', boss: 'gloomhorn', name: 'Remembrance of the Drowned Shadow', vigour: 10, flask: 1,
    text: 'A horn, heavy and still damp. Gloomhorn carried the drowned to shore for a thousand years before the moon’s tears turned it. In its last breath it tried to carry you. The Second Link is broken.' },
  { id: 'rem-solenne', boss: 'solenne', name: 'Remembrance of the Blind Sunkeeper', art: 'art-phantom', vigour: 10,
    text: 'A disc of the kept sun, cooling. Solenne made a false dawn so the world would not despair, and put out her eyes so she would not have to see it was false. The Third Link is broken. Her light guides your blades: Phantom Blades.' },
  { id: 'rem-glutton', boss: 'glutton', name: 'Remembrance of the Glutton', vigour: 15, flask: 1,
    text: 'A prism, humming. Every colour the Choir sang was inside the Glutton; they pour out of it now, into the Codex. The Fourth Link is broken.' },
  { id: 'rem-vermilion', boss: 'vermilion', name: 'Remembrance of the Red Calamity', art: 'art-rend', vigour: 10,
    text: 'A scale that is warm to hold. Vermilion was the sun’s own dragon; the king took its fire and chained it in the Red Keep to leave the day with no champion. The Fifth Link is broken. The fire is yours now: Bloodmoon Rend.' },
  { id: 'rem-caddoc', boss: 'caddoc', name: 'Remembrance of the Last Charge', art: 'art-sunder', vigour: 15,
    text: 'A lance-head, notched from four hundred years of riding against the dawn. Caddoc swore first and fell last. The Sixth Link is broken, and every oath worked into it is free: Sunder.' },
  { id: 'rem-hivequeen', boss: 'hivequeen', name: 'Remembrance of the Hive Queen', vigour: 15, flask: 1,
    text: 'A drop of amber with a dream inside. The Queen kept the world asleep so it would not notice the night. The Seventh Link is broken. Everywhere along the road, people are waking up.' },
  { id: 'rem-sovereign', boss: 'sovereign', name: 'Remembrance of the Pale Sovereign',
    text: 'A crown of cold light, already fading. He only wanted one more night without a morning, and then one more. At the end, he let go. The Last Link is broken; the moon goes home, and the sun comes up over Hollowmere.' },
];

export const ARCS: ChapterArc[] = [
  { chapter: 1, title: 'The Hollow Reach', text: 'Hollowmere burned; its fire did not. Oswin, a masked wanderer, kept it for you. Isolde went east along the Long Road with the Codex. The Gravewarden holds the Highpine Gate and the First Link.' },
  { chapter: 2, title: 'The Violet Fen', text: 'Where the Moon-kings were crowned in glowing water. The fen’s colossus drank the moon’s tears; it holds the Second Link, and the road to the coast.' },
  { chapter: 3, title: 'The Sunkeepers’ Coast', text: 'The sun-order’s terraces fall into a sea the colour of a dawn that never came. Over the Temple of the Sun hangs a sun Solenne made herself. She holds the Third Link.' },
  { chapter: 4, title: 'The Crystal Deep', text: 'The Prism Choir sang the colours back into the world, until the Glutton ate them. Isolde could not pass it. The Fourth Link, and every colour, are inside it.' },
  { chapter: 5, title: 'The Bloodstone Wastes', text: 'Red canyons where the war on the sun was fought in one afternoon. The sun’s dragon, Vermilion, is chained in the Red Keep with the Fifth Link.' },
  { chapter: 6, title: 'The Knight’s March', text: 'The knights of the March gave their oaths to the Chain and planted their swords. Sir Caddoc, first to swear, still rides against the dawn. He holds the Sixth Link.' },
  { chapter: 7, title: 'The Dreaming Wastes', text: 'A waste of old gods of glass, a sleeping bard, an orchard that hums. The Hive Queen keeps the world dreaming. Oswin has something to tell you before you climb.' },
  { chapter: 8, title: 'The Dawnspire', text: 'Liriel’s garden, her white cathedral, the Chain Road — and the tower at the centre of the world, where Maelor holds the Last Link and the moon.' },
];

/** What Oswin says, in order of precedence (first matching line wins). */
export interface WandererState {
  bosses: Set<string>;
  gates: number;
  kindled: number;
  pages: number;
  cleared: number;
  finale: boolean;
}

export const WANDERER_LINES: { when: (s: WandererState) => boolean; text: string }[] = [
  { when: s => s.finale, text: 'Look — you have a shadow. So do I; I had forgotten. Go home, Wren. Hollowmere will want to see the morning with you. I will stay a while and watch it take my chain apart.' },
  { when: s => s.bosses.has('hivequeen'), text: 'Before you climb, the truth. I am the Chainwright. Maelor came to me the morning Liriel died and asked for something that could hold the moon still. I made it from the oaths of his knights. Isolde found my mark on the links. She forgave me. Break what I made.' },
  { when: s => s.bosses.has('caddoc'), text: 'Caddoc was the first to swear on the Chain. I remember the sound his oath made going into the iron. The Wastes ahead will try to make you sleep. Do not lie down, whatever you see.' },
  { when: s => s.bosses.has('vermilion'), text: 'The dragon’s fire is in you now; I can see it in your eyes. The March ahead is full of swords with no one holding them. The one who still holds his will not stop until you stop him.' },
  { when: s => s.bosses.has('glutton'), text: 'The colours are back in the Codex. Can you feel how heavy it is now? The Wastes beyond are red. The dragon up there was never the enemy. Free it.' },
  { when: s => s.bosses.has('solenne'), text: 'Solenne’s sun is out. Poor woman; it was a kindness, in its way. Below the coast is the Deep, where Isolde turned back once. She went on anyway. So will you.' },
  { when: s => s.bosses.has('gloomhorn'), text: 'You put the colossus to rest. It was kind once. The coast ahead is bright; mind the Keepers’ light — look away when it swells.' },
  { when: s => s.bosses.has('morrow'), text: 'The Gravewarden is down and the gate is open. Eight links hold the moon, Wren, one for each of Maelor’s great servants. One is broken. I will be waiting at the next fire.' },
  { when: s => s.cleared > 0, text: 'Blood on your blade. Clear the Moon-knights’ camps along the road and the mist at the gate will know you. The Gravewarden waits before it.' },
  { when: s => s.kindled > 1, text: 'You kindled a shrine out there. Good. Rest at them; they remember where you fell, and they carry you back along the road.' },
  { when: s => s.pages > 1, text: 'Your sister’s handwriting. Every page is a colour the night forgot to take. She hid them where only an Emberwarden would look. Find the rest.' },
  { when: () => true, text: 'Ah. Awake at last. I kept the fire for you. Your sister went east with her book; the road goes where she went, all the way to the tower you can see under the moon. Hold Shift and be still to gather your strength. Rest at every ember you find.' },
];
