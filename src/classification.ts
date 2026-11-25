import { cosine } from './retrieval.ts'

export const categoryDescriptions = {
  Education: 'courses and academic education, classroom assignments, exams, university study, lecture notes and tutorials',
  Work: 'professional workplace projects, client business meetings, team discussions, deliverables and project decisions',
  Finance: 'banking, credit, investments, savings, money transfers, taxes, loans and account payments',
  Shopping: 'online purchases, retail orders, restaurant receipts, products, refunds, deliveries and prices',
  Personal: 'private journal, friendships, family, hobbies, recipes, home and everyday life',
  Travel: 'trip planning, plane and train tickets, hotel reservations, itineraries, tourism and destinations',
  Health: 'medical appointment, medicine, healthcare, exercise, symptoms, treatment and wellness',
  Tasks: 'to do items, chores, action checklist, due dates, pending work, responsibilities and reminders',
  Technology: 'software programming, computer systems, algorithms, technology, code and engineering',
  References: 'articles for reading, resource links, books, design research references, manuals and bibliography',
} as const
export type Category = keyof typeof categoryDescriptions
export const categories = Object.keys(categoryDescriptions) as Category[]

// These descriptions describe the purpose of a capture, without requiring class names in its text.
export const categoryExamples: Record<Category, string[]> = {
  Education: ['A teacher or professor assigns coursework, reading, exams, lab reports or a classroom project.', 'Notes taken in a school or university lesson while learning a subject or preparing for assessment.', 'College enrollment, course module information, class scheduling and study material for a student.', 'The lecturer uploaded practice problems and the marking criteria for the next assignment.'],
  Work: ['A staff member records decisions about a client, project, business delivery or operational meeting.', 'A hiring interview, workplace onboarding, performance feedback or an internal team handoff.', 'A professional message about a contract, supplier, colleague, presentation or customer deadline.', 'The project lead will send the revised brief for stakeholder approval after the team meeting.'],
  Finance: ['A personal bank statement, savings balance, transfer record, investment holding, credit or interest calculation.', 'An income tax return, salary, pension, insurance premium, loan repayment or annual financial declaration.', 'Money moved or held in accounts, rather than merchandise, a retail receipt or an order return.', 'The statement shows the balance after the bank credited interest and deducted the account charge.'],
  Shopping: ['A retail purchase, receipt for goods or food, store return, warranty claim or product exchange.', 'A comparison of items to buy, a cart checkout, vendor prices, stock, delivery or an order refund.', 'A store or restaurant bill for products and services bought as a customer, including a receipt total.', 'The shop sent a replacement after the delivered item arrived broken. Keep the order receipt.'],
  Personal: ['A private diary, family recollection, friendship, household story, recipe or personal memory.', 'A note about home hobbies, gardening, making art, cooking or something someone did for pleasure.', 'Observations about everyday life or creative activities, without requiring a checkable errand.', 'My sister brought plants from her garden and I tried a new recipe when she visited.'],
  Travel: ['A journey itinerary with transport times, gates, tickets, terminals, train routes or transit connections.', 'A hotel reservation, guesthouse directions, arrival details, a holiday booking or trip planning.', 'Getting to and staying in a destination, including airport instructions and sightseeing logistics.', 'The train leaves early, so check out before breakfast and allow time to reach the station.'],
  Health: ['A clinician, therapist, dentist or pharmacy visit, referral, medical procedure or diagnostic test.', 'Instructions about a symptom, prescription dose, injury, treatment, recovery or exercise for wellness.', 'Health observations to show a care provider and administrative notes from a clinic or hospital.', 'The doctor asked me to bring my medication list and a record of recent symptoms.'],
  Tasks: ['A checklist of things to do, errands to run, calls to make and simple reminders around daily life.', 'An action note specifying what needs to be done or sent for an ordinary responsibility or chore.', 'A short reminder to collect, return, fix, book or check something with a follow-up or due date.', 'Before tomorrow, return a borrowed thing, collect a package and tell someone once it is done.'],
  Technology: ['Computer software, programming languages, source code, development tooling or debugging notes.', 'Network setup, operating systems, hardware, servers, code errors, database queries or technical implementation.', 'A technical explanation of how a computing system works and how to configure or repair it.', 'The application failed because a database migration ran before the server finished initializing.'],
  References: ['A bookmarked reading source, guide, bibliography, catalogue, journal article or archive for later consultation.', 'An outside resource such as a handbook, reference image, public collection or documentation saved for research.', 'A link roundup, publication or reading list held as source material rather than a class assignment or work memo.', 'Keep this illustrated guide and its source links for lookup during future research.'],
}

export type CategoryMethod = 'description' | 'prototype-max' | 'prototype-mean' | 'supervised'

export const categoryVersion = 'minilm-linear-1'

export function linearCategoryScores(vector: Float32Array, weights: ReadonlyArray<ArrayLike<number>>) {
  const logits = weights.map(row => vector.reduce((score, value, index) => score + value * row[index], row[vector.length]))
  const pivot = Math.max(...logits)
  const exponents = logits.map(value => Math.exp(value - pivot))
  const total = exponents.reduce((sum, value) => sum + value, 0)
  return exponents.map(value => value / total)
}

export function categoryScores(vector: Float32Array, prototypes: Float32Array[], method: Exclude<CategoryMethod, 'supervised'>) {
  const count = method === 'description' ? 1 : prototypes.length / categories.length
  return categories.map((_, index) => {
    const scores = prototypes.slice(index * count, (index + 1) * count).map(example => cosine(vector, example))
    return method === 'prototype-mean' ? scores.reduce((sum, score) => sum + score, 0) / count : Math.max(...scores)
  })
}

export function decideCategory(scores: number[], minimum: number, separation: number) {
  const ranked = categories.map((category, index) => ({ category, similarity: scores[index] })).sort((a, b) => b.similarity - a.similarity)
  const [best, second] = ranked
  const margin = best.similarity - second.similarity
  return { category: best.similarity >= minimum && margin >= separation ? best.category : undefined, similarity: best.similarity, margin }
}

export function classify(vector: Float32Array, prototypes: Float32Array[]) {
  return decideCategory(categoryScores(vector, prototypes, 'description'), .26, .035)
}
