import type { Language, Length, RunMode } from "@/lib/runMode";

/** Character bounds of each length; a prompt's length is read from its text, never tagged. */
export const LENGTH_BOUNDS: Record<Length, readonly [min: number, max: number]> = {
  short: [40, 80],
  medium: [90, 140],
  long: [150, 220],
};

/** Only what any keyboard of that language types directly: no curly quotes, dashes,
 * inverted marks or accented capitals. `scripts/check-prompts.mjs` enforces it. */
export const PROMPTS: Record<Language, readonly string[]> = {
  en: [
    "Small daily actions often lead to remarkable results over time.",
    "Good ideas become better when you give them room to breathe.",
    "Progress rarely feels dramatic while it is actually happening.",
    "Simple things done consistently tend to matter more than expected.",
    "The quietest moments can sometimes produce the clearest thoughts.",
    "A little patience can turn a difficult problem into a simple one.",
    "There is something satisfying about making small things work well.",
    "Some days are for moving quickly and others are for finding direction.",
    "The best work often begins before you know exactly where it is going.",
    "Small improvements become surprisingly powerful when repeated often.",
    "Every quiet morning holds a little room for something new.",
    "Clear thinking usually starts with a short walk outside.",
    "A steady rhythm will carry you further than a sudden burst.",
    "The river does not hurry, yet it always reaches the sea.",
    "Curiosity is a lamp that keeps working in the dark.",
    "Some of the best plans are written on the back of a receipt.",
    "Rest is part of the work, not a break away from it.",
    "A good question is often worth more than a quick answer.",
    "The first draft only has to exist; it does not have to be good.",
    "Light travels far, but kindness seems to travel even further.",

    "Most skills grow quietly in the background, long before anyone else notices that anything has changed at all.",
    "When the path ahead looks unclear, it often helps to take one small step and see what the next view reveals.",
    "A well organized desk will not do the work for you, but it does make starting a lot less painful on slow days.",
    "The ocean looks calm from far away, yet up close every wave is busy carrying something from one place to another.",
    "Learning to type faster is mostly about trusting your fingers and letting your eyes stay a few words ahead.",
    "Old maps are full of blank spaces, and every one of them was once an invitation for somebody brave to go and look.",
    "Good teams rarely agree on everything, but they always agree on what they are trying to build together.",
    "There is a special kind of quiet that only appears late at night, when the city finally forgets to make noise.",
    "A small garden can teach patience better than any book, because nothing grows faster just because you watch it.",
    "The best conversations wander a little, drifting from one idea to another until they land somewhere unexpected.",
    "Every tool feels clumsy at first, and then one day it simply becomes an extension of the way you already think.",
    "Mountains look impossible from the valley, but each switchback on the trail is only a short and honest climb.",
    "Writing things down turns a crowded mind into a list, and a list is something a person can actually work through.",
    "The bakery on the corner opens before sunrise, filling the whole street with the smell of fresh bread and coffee.",
    "Some songs sound better the second time, once you know where the melody is going and can enjoy the way there.",
    "Practice does not make anything perfect, but it does make the hard parts feel familiar enough to stop being scary.",
    "A long train ride is a strange gift: hours of moving forward with nothing to do except watch the world slide past.",
    "Clouds change shape so slowly that you only notice it when you look away for a moment and then look back again.",
    "The simplest solution is rarely the first one you find, but it is usually the one you are glad you kept looking for.",
    "Kind words cost nothing to give, yet they can change the direction of someone's entire afternoon without warning.",

    "The lighthouse keeper climbed the spiral stairs every evening, polished the great lens until it gleamed, and waited for the first ship to appear on the dark horizon.",
    "Building something worthwhile takes longer than anyone expects. The trick is to enjoy the small daily progress, because the finished thing is only one moment at the end.",
    "Snow fell softly over the sleeping village, covering the rooftops, the empty market and the old stone bridge, until the whole valley looked like an unwritten page.",
    "A good teacher does not hand you the answer. Instead, they ask the question that makes you notice what you already knew, and then they step aside and let you find the rest.",
    "The expedition carried maps, compasses and enough food for three weeks, but the most useful thing they brought turned out to be a deck of cards for the long, windy evenings.",
    "Typing well is a lot like playing music. At first every key needs your full attention, then patterns begin to form, and eventually whole words flow out without a thought.",
    "On clear summer nights the old astronomer opened the roof of the observatory, pointed the telescope at a faint smudge of light, and patiently counted stars until dawn.",
    "Cities change slowly and then all at once. A shop closes, a park opens, a new bridge crosses the river, and suddenly the neighborhood you knew so well feels new again.",
    "The best ideas rarely arrive while you are staring at a screen. They tend to show up in the shower, on a walk, or right before sleep, when your mind finally stops trying.",
    "Every forest begins with a single seed that nobody notices. Years later, people walk beneath its branches and never think about the patient work that happened underground.",
    "She packed a small bag, left a note on the kitchen table and caught the early train to the coast, determined to spend at least one whole day without looking at a clock.",
    "Learning a new language feels like moving into an unfamiliar house. For weeks you bump into furniture in the dark, and then one morning you walk through every room with ease.",
    "The workshop smelled of sawdust and varnish. Rows of half finished chairs waited along the wall, each one shaped by hand, each one slightly different from the one beside it.",
    "When the storm finally passed, the fishermen walked down to the harbor, checked every rope and every sail, and then sat together on the pier to watch the sky turn gold.",
    "A computer will do exactly what you tell it to do, which is both its greatest strength and the reason so many programmers spend their evenings searching for one missing comma.",
    "Long distance runners say the race is won in the quiet middle miles, when the crowd has thinned out, the excitement is gone, and only a steady rhythm keeps them moving.",
    "The library stayed open late on Thursdays. Students filled the long wooden tables, lamps glowed in neat rows, and the only sound was the gentle turning of many pages.",
    "Nobody remembers the exact moment they learned to ride a bicycle. One day the wobbling simply stopped, the wind picked up, and the road ahead opened like a promise.",
    "Great maps leave things out on purpose. A map that showed every tree and every stone would be as large as the land itself, and far too heavy for any traveler to carry.",
    "Morning light crept across the kitchen floor, the kettle began to whistle, and for a few calm minutes before the day really started, everything felt where it belonged.",
  ],
  es: [
    "Las pequeñas acciones diarias suelen traer grandes resultados.",
    "Una buena idea mejora cuando le das espacio para respirar.",
    "El progreso casi nunca parece dramático mientras sucede.",
    "La paciencia convierte un problema difícil en algo simple.",
    "El río no tiene prisa, pero siempre llega al mar.",
    "Los mejores planes a veces se escriben en una servilleta.",
    "Descansar también es parte del trabajo, no una pausa de él.",
    "Una buena pregunta vale más que una respuesta rápida.",
    "El primer borrador solo tiene que existir, no ser perfecto.",
    "La curiosidad es una lámpara que funciona en la oscuridad.",
    "Un ritmo constante llega más lejos que un impulso repentino.",
    "Las mañanas tranquilas siempre guardan lugar para algo nuevo.",
    "Caminar un rato suele ordenar los pensamientos.",
    "Hay algo muy satisfactorio en hacer bien las cosas pequeñas.",
    "Algunos días son para correr y otros para encontrar el rumbo.",
    "El mejor trabajo empieza antes de saber adónde va.",
    "La luz viaja lejos, pero la amabilidad llega todavía más lejos.",
    "Las cosas simples, hechas con constancia, importan mucho.",
    "Los momentos de silencio traen los pensamientos más claros.",
    "Cada tecla que aciertas te acerca un poco más a la meta.",

    "La mayoría de las habilidades crecen en silencio, mucho antes de que alguien note que algo cambió de verdad.",
    "Cuando el camino no se ve claro, ayuda dar un paso pequeño y mirar qué nos muestra el siguiente paisaje.",
    "El mar parece tranquilo desde lejos, pero de cerca cada ola está ocupada llevando algo de un lugar a otro.",
    "Escribir rápido consiste sobre todo en confiar en los dedos y dejar que los ojos vayan unas palabras adelante.",
    "Los mapas antiguos estaban llenos de espacios en blanco, y cada uno era una invitación para ir a mirar.",
    "Los buenos equipos no coinciden en todo, pero siempre saben qué es lo que están intentando construir juntos.",
    "Hay un silencio especial que solo aparece de noche, cuando la ciudad por fin se olvida de hacer ruido.",
    "Un jardín pequeño enseña paciencia mejor que cualquier libro, porque nada crece más rápido por mirarlo.",
    "Las mejores conversaciones se desvían un poco y saltan de una idea a otra hasta llegar a un lugar inesperado.",
    "Toda herramienta se siente torpe al principio, hasta que un día se vuelve parte de tu forma de pensar.",
    "Las montañas parecen imposibles desde el valle, pero cada curva del sendero es solo una subida corta y honesta.",
    "Anotar las cosas convierte una mente llena de ruido en una lista, y una lista siempre se puede trabajar.",
    "La panadería de la esquina abre antes del amanecer y llena toda la calle con olor a pan recién hecho y café.",
    "La práctica no vuelve nada perfecto, pero hace que las partes difíciles se sientan familiares y menos temibles.",
    "Un viaje largo en tren es un regalo extraño: horas avanzando sin otra tarea que mirar cómo pasa el mundo.",
    "Las nubes cambian de forma tan despacio que solo lo notas cuando miras hacia otro lado y luego vuelves a mirar.",
    "La solución más simple rara vez es la primera que encuentras, pero casi siempre es la que vale la pena buscar.",
    "Las palabras amables no cuestan nada, y sin embargo pueden cambiar por completo la tarde de otra persona.",
    "El viento de la tarde movía las hojas del parque mientras los chicos jugaban a la pelota cerca de la fuente.",
    "Leer antes de dormir es una costumbre sencilla que convierte el final del día en un pequeño viaje tranquilo.",

    "El guardián del faro subía cada tarde la escalera de caracol, limpiaba la gran lente hasta dejarla brillante y esperaba a que el primer barco apareciera en el horizonte.",
    "Construir algo que valga la pena lleva más tiempo del que uno imagina. El secreto es disfrutar del pequeño avance de cada día, porque la obra terminada es solo un instante.",
    "La nieve caía despacio sobre el pueblo dormido, cubría los techos, el mercado vacío y el viejo puente de piedra, hasta que el valle parecía una página sin escribir.",
    "Un buen maestro no te da la respuesta. Te hace la pregunta que te ayuda a notar lo que ya sabías, y después se hace a un lado para que descubras el resto por tu cuenta.",
    "La expedición llevaba mapas, brújulas y comida para tres semanas, pero lo más útil que trajeron resultó ser un mazo de cartas para las noches largas y llenas de viento.",
    "Escribir bien en el teclado se parece mucho a tocar música. Al principio cada tecla pide toda tu atención, después aparecen los patrones y al final las palabras salen solas.",
    "En las noches claras de verano, el viejo astrónomo abría el techo del observatorio, apuntaba el telescopio a una mancha de luz y contaba estrellas hasta el amanecer.",
    "Las ciudades cambian despacio y de repente todo junto. Cierra un negocio, abre una plaza, un puente nuevo cruza el río y el barrio que conocías vuelve a sentirse nuevo.",
    "Las mejores ideas casi nunca llegan frente a una pantalla. Suelen aparecer en la ducha, durante una caminata o justo antes de dormir, cuando la mente deja de esforzarse.",
    "Todo bosque empieza con una semilla que nadie ve. Años después, la gente camina bajo sus ramas sin pensar en el trabajo paciente que ocurrió en silencio bajo la tierra.",
    "Preparó un bolso pequeño, dejó una nota sobre la mesa de la cocina y tomó el primer tren hacia la costa, decidida a pasar un día entero sin mirar ningún reloj.",
    "Aprender un idioma nuevo es como mudarse a una casa desconocida. Durante semanas chocas con los muebles a oscuras, y una mañana recorres cada habitación sin esfuerzo.",
    "El taller olía a aserrín y barniz. Filas de sillas a medio terminar esperaban contra la pared, cada una hecha a mano y cada una apenas distinta de la que tenía al lado.",
    "Cuando la tormenta por fin pasó, los pescadores bajaron al puerto, revisaron cada cuerda y cada vela, y después se sentaron en el muelle a mirar cómo el cielo se doraba.",
    "Una computadora hace exactamente lo que le pides, y esa es a la vez su mayor virtud y la razón por la que tantos programadores pasan la noche buscando una coma perdida.",
    "Los corredores de fondo dicen que la carrera se gana en los kilómetros tranquilos del medio, cuando el público ya se fue y solo un ritmo constante los sostiene.",
    "La biblioteca cerraba tarde los jueves. Los estudiantes llenaban las mesas largas de madera, las lámparas brillaban en filas y solo se oía el suave pasar de las páginas.",
    "Nadie recuerda el momento exacto en que aprendió a andar en bicicleta. Un día el tambaleo simplemente se detuvo, el viento empezó a soplar y el camino se abrió.",
    "Los buenos mapas dejan cosas afuera a propósito. Un mapa que mostrara cada árbol y cada piedra sería tan grande como la tierra misma y demasiado pesado para llevarlo.",
    "La luz de la mañana avanzaba por el piso de la cocina, la pava empezó a silbar y, durante unos minutos tranquilos antes de empezar el día, todo parecía estar en su lugar.",
  ],
};

export function lengthOf(text: string): Length | null {
  for (const length of Object.keys(LENGTH_BOUNDS) as Length[]) {
    const [min, max] = LENGTH_BOUNDS[length];
    if (text.length >= min && text.length <= max) return length;
  }
  return null;
}

const pools = new Map<string, readonly string[]>();

/** The prompts of a mode, in source order (the first one is the deterministic first prompt). */
export function promptsFor({ language, length }: RunMode): readonly string[] {
  const key = `${language}:${length}`;
  let pool = pools.get(key);
  if (!pool) {
    pool = PROMPTS[language].filter(text => lengthOf(text) === length);
    pools.set(key, pool);
  }
  return pool;
}

/** A random prompt of `mode` that is not in `avoid`; the most recent entries win when the
 * pool is too small to avoid them all, so a prompt never repeats back to back. */
export function pickPrompt(mode: RunMode, avoid: readonly string[], random = Math.random) {
  const pool = promptsFor(mode);
  const recent = new Set(pool.length > 1 ? avoid.slice(-(pool.length - 1)) : []);
  const available = pool.filter(text => !recent.has(text));
  return available[Math.floor(random() * available.length)];
}
