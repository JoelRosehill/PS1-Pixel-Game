/**
 * The story of Chromatic Odyssey (Job 9), told the Elden Ring way: in fragments found
 * beside landmarks, in the kneeling dead, in what bosses leave behind, and in what the
 * Wanderer at the Threshold is willing to say.
 *
 * The spine: long ago the Sunkeepers kept the day and the Moon-kings kept the night.
 * The last Moon-king, the Pale Sovereign, could not bear endings, so he chained the moon
 * to the world and night never ended. The chained moon bleeds — the red moon over every
 * sky. The Emberwardens planted their swords in the last fires to keep them burning;
 * those are the Ember Shrines. You are the last Emberwarden, woken at the Threshold.
 */

export interface LoreFragment {
  id: string;
  title: string;
  text: string;
  /** 0 = the Threshold (hub). */
  chapter: number;
}

export interface Remembrance {
  id: string;
  /** Boss id that leaves it. */
  boss: string;
  name: string;
  text: string;
}

export interface ChapterArc {
  chapter: number;
  title: string;
  text: string;
}

/** One fragment per biome site, keyed by site id (`c<chapter>-<slot>`), plus the hub's. */
export const LORE: Record<string, LoreFragment> = {
  // --- The Threshold ---------------------------------------------------------------
  'hub-1': { id: 'hub-1', chapter: 0, title: 'Scratched into the shrine stones',
    text: 'Keep it burning. Whatever else goes dark, keep this one burning. — the last of the Emberwardens, to the next.' },
  'hub-2': { id: 'hub-2', chapter: 0, title: 'A page pinned to the castle gate',
    text: 'The night has lasted four hundred years. The children born in it have never seen a shadow cast by the sun, and ask what the word "morning" is for.' },
  'hub-3': { id: 'hub-3', chapter: 0, title: 'Carved into the bridge',
    text: 'The Warden holds this crossing for a king who no longer remembers him. Knights of the Moon keep their oaths long after the reasons rot.' },

  // --- Chapter I · The Tranquil Reach -------------------------------------------------
  'c1-0': { id: 'c1-0', chapter: 1, title: 'Watchman’s log, last entry',
    text: 'Still no dawn. The pines don’t seem to mind. I have started to envy them.' },
  'c1-1': { id: 'c1-1', chapter: 1, title: 'A child’s drawing, weighted by a stone',
    text: 'Two moons over a lake: one in the sky, one in the water. Only the one in the water is silver. Underneath, in careful letters: "the real one".' },
  'c1-2': { id: 'c1-2', chapter: 1, title: 'Bark tag on the elder tree',
    text: 'The Sunkeepers planted this grove to count the autumns. The leaves turned, and turned, and then stopped turning. They have been burning red ever since, waiting for a winter that never comes.' },
  'c1-3': { id: 'c1-3', chapter: 1, title: 'Muster roll, Highpine Keep',
    text: 'Forty names. Thirty-nine struck through. Beside the last: "went up to the pass to see if the mist would part. It will not part for one."' },
  'c1-4': { id: 'c1-4', chapter: 1, title: 'Words around the meadow door',
    text: 'This door opens onto the morning. Knock twice, and wait for it to rise. (Someone has added, much later: "it doesn’t.")' },

  // --- Chapter II · The Violet Fen ------------------------------------------------------
  'c2-0': { id: 'c2-0', chapter: 2, title: 'Inscription on the drowned circle',
    text: 'Here the Moon-kings were crowned, standing in the water so the moon would see herself behind them. The water still remembers. That is why it glows.' },
  'c2-1': { id: 'c2-1', chapter: 2, title: 'A lantern-keeper’s tally',
    text: 'One light for every soul lost in the bog. I have run out of lanterns. The bog has not run out of souls. The mushrooms have taken over the counting.' },
  'c2-2': { id: 'c2-2', chapter: 2, title: 'Hymn-sheet from the drowned chapel',
    text: '"Sleep, moon, sleep; the world will keep." The last verse is scratched out, and written over it: "the world will keep you. He will make sure of it."' },
  'c2-3': { id: 'c2-3', chapter: 2, title: 'A warning in wisp-light',
    text: 'Do not follow the pink lights. They are not guides. They are the fen’s grief looking for somewhere warm to rest.' },
  'c2-4': { id: 'c2-4', chapter: 2, title: 'Note beside the great bones',
    text: 'The mire-beasts were gentle once. They carried the drowned to the shore so they could be buried. Then the moon began to weep into the water, and they drank.' },

  // --- Chapter III · The Sunkeepers' Coast ------------------------------------------------
  'c3-0': { id: 'c3-0', chapter: 3, title: 'Temple dedication',
    text: 'To the Low Sun, who sets but never leaves. — The Sunkeepers built for a sun that would always come back. When it did not, they did not know how to stop praying.' },
  'c3-1': { id: 'c3-1', chapter: 3, title: 'Water-clock inscription',
    text: 'Every step of the cascade is one hour of daylight. Count them: there are twelve. The water has fallen past the last step for four hundred years, and the clock has been striking midnight ever since.' },
  'c3-2': { id: 'c3-2', chapter: 3, title: 'Coral-stone tablet',
    text: 'We blinded ourselves with our own light so we would not see the dark. Forgive the Keepers you meet. They are still trying to make the morning, with their eyes closed.' },
  'c3-3': { id: 'c3-3', chapter: 3, title: 'Gardener’s ledger',
    text: 'The heliotropes turn to face the sun. Where there is no sun, they turn toward the brightest thing they can find. Lately that has been you.' },
  'c3-4': { id: 'c3-4', chapter: 3, title: 'Last minutes of the agora',
    text: 'Motion: to ask the Moon-king to release the moon. Carried unanimously. Delegation sent. Delegation did not return. The sea rose that night and has not gone down.' },

  // --- Chapter IV · The Crystal Deep -------------------------------------------------------
  'c4-0': { id: 'c4-0', chapter: 4, title: 'Engraved on the singing hall',
    text: 'The crystals are the moon’s tears, fallen and frozen. Listen closely: they are not singing. They are calling someone by name.' },
  'c4-1': { id: 'c4-1', chapter: 4, title: 'Frost-scratched warning',
    text: 'Do not breathe on the galleries. They grow toward warmth. So did the last Emberwarden who slept here.' },
  'c4-2': { id: 'c4-2', chapter: 4, title: 'Miner’s letter, unsent',
    text: 'The rose vault pulses slow as a heart. Tomorrow we break it open to see what beats inside. My love to the children. If there is a tomorrow, I will tell you what we found.' },
  'c4-3': { id: 'c4-3', chapter: 4, title: 'Chalk on the geode wall',
    text: 'The world is hollow here. That is where the Sovereign keeps the chain’s other end.' },
  'c4-4': { id: 'c4-4', chapter: 4, title: 'Echo-stone',
    text: 'Speak your name into the stone and it speaks back someone else’s. Mine came back as the Sovereign’s. I do not think it was a mistake.' },

  // --- Chapter V · The Bloodstone Wastes ------------------------------------------------------
  'c5-0': { id: 'c5-0', chapter: 5, title: 'Plaque at the citadel gate',
    text: 'Here the sun’s dragon was brought low and its fire taken, so that the night would have no enemy. Vermilion still burns. It simply has nothing left to burn for.' },
  'c5-1': { id: 'c5-1', chapter: 5, title: 'Canyon wall graffiti',
    text: 'The rock is red because the moon bled onto it for four hundred years. Touch it. It is still warm.' },
  'c5-2': { id: 'c5-2', chapter: 5, title: 'Oath carved into a spire',
    text: 'We swore to keep the night until the king released us. He never will. We have become the night we kept. — a Knight of the Moon, before the shadow took his face.' },
  'c5-3': { id: 'c5-3', chapter: 5, title: 'Ossuary register',
    text: 'The Sovereign’s war on the sun lasted one afternoon. The burying has lasted four hundred years.' },
  'c5-4': { id: 'c5-4', chapter: 5, title: 'Inscription on the weeping door',
    text: 'Through this door, the way to the king’s garden. It weeps because it knows what is on the other side, and would rather not be opened.' },

  // --- Chapter VI · The Ashen March ------------------------------------------------------------
  'c6-0': { id: 'c6-0', chapter: 6, title: 'Scorched decree',
    text: 'By order of the Pale Sovereign: the March shall burn, so that the smoke may hide the moon’s wound from the other kingdoms. — The smoke hid nothing. The kingdoms were already gone.' },
  'c6-1': { id: 'c6-1', chapter: 6, title: 'Marsh-keeper’s complaint',
    text: 'The water here is warm. The fish have learned to live in ash. I have not.' },
  'c6-2': { id: 'c6-2', chapter: 6, title: 'Glass tablet',
    text: 'The sea here burned and cooled into steps. The Sunkeepers walked up them to beg the sky for morning. The sky did not answer; it was busy being chained.' },
  'c6-3': { id: 'c6-3', chapter: 6, title: 'Charcoal-rubbing of a ring',
    text: 'The burning elder remembers every leaf it has lost. It glows from the inside because it cannot stop remembering.' },
  'c6-4': { id: 'c6-4', chapter: 6, title: 'Ember-hall rune',
    text: 'The deepest fire in the world burns here, far from the moon. The Emberwardens took their first flames from it. Take yours.' },

  // --- Chapter VII · The Frozen Choir ------------------------------------------------------------
  'c7-0': { id: 'c7-0', chapter: 7, title: 'The choir’s last song',
    text: 'We sang the moon down from the sky so the king could hold her. We did not know he meant to never let go. Now the ice sings our song back to us, forever, and we cannot stop listening.' },
  'c7-1': { id: 'c7-1', chapter: 7, title: 'Lamp-keeper’s oath',
    text: 'The last lamp in the north is lit. As long as it burns, someone is waiting for someone to come home. It burns still.' },
  'c7-2': { id: 'c7-2', chapter: 7, title: 'Words frozen into the mere',
    text: 'The mere froze mid-wave the night the moon was chained. Those who drowned that night are still falling.' },
  'c7-3': { id: 'c7-3', chapter: 7, title: 'Frost-temple prayer',
    text: 'Low Sun, if you can hear us from wherever the dark has put you: we kept your temple. We kept it cold, but we kept it.' },
  'c7-4': { id: 'c7-4', chapter: 7, title: 'Carved into the sky-whale’s rib',
    text: 'The sky-whales swam between the stars and the moon. When she was chained, they had nowhere left to swim. This one came down to die where it could still see her.' },

  // --- Chapter VIII · The Last Garden ----------------------------------------------------------------
  'c8-0': { id: 'c8-0', chapter: 8, title: 'The gardener’s promise',
    text: 'The king asked for a garden where nothing ever ends. I planted one. I did not tell him that nothing growing here can ever bloom.' },
  'c8-1': { id: 'c8-1', chapter: 8, title: 'A root of starlight',
    text: 'Stars fell here when the moon was pulled from the sky. They took root rather than go out. Everything wants to keep burning. That is not the same as wanting to live.' },
  'c8-2': { id: 'c8-2', chapter: 8, title: 'Moon-petal note',
    text: 'She opens her petals only for the moon. The moon has been right here, in the garden, for four hundred years. She has never closed them.' },
  'c8-3': { id: 'c8-3', chapter: 8, title: 'Gold vein inscription',
    text: 'The king had every treasure in the world brought down into the dark, so the moon would have something to look at besides him.' },
  'c8-4': { id: 'c8-4', chapter: 8, title: 'Before the Pale Citadel',
    text: 'He is not cruel. He was afraid. Every night he held her, he told her: "One more." Four hundred years of one more. Be gentle with him, Emberwarden. Then set her free.' },
};

/** The kneeling dead: one Emberwarden memorial per chapter (environmental storytelling). */
export const MEMORIALS: Record<number, LoreFragment> = {
  1: { id: 'mem-1', chapter: 1, title: 'An Emberwarden, kneeling', text: 'Her sword is planted in a fire that went out long ago. She is still holding it.' },
  2: { id: 'mem-2', chapter: 2, title: 'An Emberwarden, half sunk', text: 'He waded in to carry a lantern to the drowned. The lantern is still lit.' },
  3: { id: 'mem-3', chapter: 3, title: 'An Emberwarden among the columns', text: 'She shaded her eyes against a sun that was not there. Her hand is still raised.' },
  4: { id: 'mem-4', chapter: 4, title: 'An Emberwarden, frozen at rest', text: 'He sat down to warm his hands at a crystal. The crystal is warm. He is not.' },
  5: { id: 'mem-5', chapter: 5, title: 'An Emberwarden facing the citadel', text: 'Her armour is scorched from the front. She never turned her back on the dragon.' },
  6: { id: 'mem-6', chapter: 6, title: 'An Emberwarden in the ash', text: 'He carried an ember all the way from the deep fire. It went out in his hands, one step from here.' },
  7: { id: 'mem-7', chapter: 7, title: 'An Emberwarden listening', text: 'She knelt to hear the choir. She is still listening; you can tell by the tilt of her helm.' },
  8: { id: 'mem-8', chapter: 8, title: 'The Emberwarden before you', text: 'The one who came here before you. Your own face, older, under the helm. The sword is yours now.' },
};

export const REMEMBRANCES: Remembrance[] = [
  { id: 'rem-gloomhorn', boss: 'gloomhorn', name: 'Remembrance of the Mire Colossus',
    text: 'A horn, heavy and still damp. Gloomhorn carried the drowned to shore for a thousand years before the moon’s tears poisoned the water. In its last breath it tried to carry you.' },
  { id: 'rem-vermilion', boss: 'vermilion', name: 'Remembrance of the Red Hour',
    text: 'A scale that is warm to hold. Vermilion was the sun’s own dragon; the king took its fire to leave the day with no champion. The fire is yours now. Keep it better than he did.' },
  { id: 'rem-sovereign', boss: 'sovereign', name: 'Remembrance of the Pale Sovereign',
    text: 'A crown of cold light, already fading. He only wanted one more night with the moon, and then one more. At the end, he let go. The sky will be silver tomorrow.' },
];

export const ARCS: ChapterArc[] = [
  { chapter: 0, title: 'The Threshold', text: 'You woke beside the last Ember Shrine, under a moon that bleeds. A hooded Wanderer tends the fire and says the way north is open. Everything else is sealed behind mist.' },
  { chapter: 1, title: 'The Tranquil Reach', text: 'The pines and lakes of the Reach still remember peace. Its keep stands empty, its door promises a morning that never comes. The mist at its eastern pass waits for proof that you can fight.' },
  { chapter: 2, title: 'The Violet Fen', text: 'Where the Moon-kings were crowned in glowing water. The fen’s gentle colossus drank the moon’s tears and went mad; it holds the key to the coast.' },
  { chapter: 3, title: 'The Sunkeepers’ Coast', text: 'The sun-order’s terraces descend into water the colour of a dawn that never came. The Keepers who remain pray with their eyes burned shut.' },
  { chapter: 4, title: 'The Crystal Deep', text: 'Beneath the stone, the moon’s tears froze into singing crystal. Something below calls the Sovereign by name.' },
  { chapter: 5, title: 'The Bloodstone Wastes', text: 'Red canyons where the war on the sun was fought in one afternoon. The sun’s dragon, Vermilion, still circles the citadel where its fire was taken.' },
  { chapter: 6, title: 'The Ashen March', text: 'A kingdom burned to hide the moon’s wound. The deepest fire in the world still burns beneath it.' },
  { chapter: 7, title: 'The Frozen Choir', text: 'The choir that sang the moon out of the sky. The ice sings their song back to them forever.' },
  { chapter: 8, title: 'The Last Garden', text: 'The Sovereign’s garden, where nothing ends and nothing blooms. At its heart, the Pale Citadel, and the moon held in a pair of cold hands.' },
];

/** What the Wanderer says, in order of precedence (first matching line wins). */
export interface WandererState {
  bosses: Set<string>;
  gates: number;
  kindled: number;
  pages: number;
  cleared: number;
  finale: boolean;
}

export const WANDERER_LINES: { when: (s: WandererState) => boolean; text: string }[] = [
  { when: s => s.finale, text: 'The moon is silver again. Look — you have a shadow. Rest now, Emberwarden. There is a morning to wake up for.' },
  { when: s => s.bosses.has('vermilion'), text: 'The dragon’s fire is in you now; I can see it in your eyes. The Last Garden lies at the end of every road. He is waiting. Be gentle, but do not stop.' },
  { when: s => s.bosses.has('gloomhorn'), text: 'You put the colossus to rest. It was kind once, you know. The coast is open to you; mind the Keepers’ light. Look away when it swells.' },
  { when: s => s.gates > 0, text: 'The mist parted for you. It has not done that in a long time. Somewhere in the fen, something large is weeping. It holds the next key.' },
  { when: s => s.cleared > 0, text: 'Blood on your blade. The knights you fought were oathbound to a king who forgot them. Clear enough of their camps and the mist at the pass will know you.' },
  { when: s => s.kindled > 1, text: 'You kindled a shrine out there. Good. Rest at them; they remember where you fell, and they keep the night from keeping you.' },
  { when: s => s.pages > 1, text: 'Your book grows heavier. Every page is a word the dark forgot to take. Find the rest; you will need all of them.' },
  { when: () => true, text: 'Ah. Awake at last. I kept the fire for you. The moon has bled for four hundred years; someone has to go and ask the king to let her go. Take the northern valley. Rest at every ember you find.' },
];
