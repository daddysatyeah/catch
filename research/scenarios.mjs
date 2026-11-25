// Original synthetic material. Each exact and paraphrased query has authored relevance labels.
export const scenarios = [
  ['Education','Discrete maths exam','The combinatorics midterm covers pigeonhole principle, graph coloring and induction. Bring a ruler.','pigeonhole exam','What topics should I study for the counting and graph theory test?'],
  ['Education','Chemistry lab report','Finish the titration writeup. The endpoint was pale pink; the sodium hydroxide concentration was 0.10 molar.','titration endpoint','Where did I record when the acid-base reaction finished?'],
  ['Education','Night lab notice','The notice image has the orientation room and the report submission date.','B-215 18:30','Where and when is the evening science orientation?','university-notice'],
  ['Work','Studio handoff','Handoff checklist for the client. Send wireframes to the production designer after typography approval.','handoff wireframes','What should the team pass to production after the font decision?'],
  ['Work','Interview debrief','The panel asked about postmortems, cache invalidation and explaining a difficult trade-off to stakeholders.','interview postmortems','What did the hiring panel ask about reliability incidents?'],
  ['Work','Coastal research PDF','Field notes from the equipment survey. The deadline and inventory reference are on page two.','QZ-9157','Where are the due date and equipment reference for my coastal survey?','two-pages'],
  ['Finance','Bank transfer record','Moved INR 14,500.00 into the household sinking fund. Transfer reference: TX-48217.','TX-48217','Where is the proof I moved money into the household reserve?'],
  ['Finance','Quarterly tax worksheet','Tax estimate for November: separate taxable consulting income and reimbursable travel before paying the quarterly installment.','tax worksheet','How should I separate business reimbursements from the amount I owe?'],
  ['Finance','Scanned services invoice','A scanned invoice contains the provider reference and currency total from the service contract.','TD-6512','Where is the bill for Tideline and how much is due?','scanned-invoice'],
  ['Shopping','Studio print receipt','Store receipt screenshot for art prints. See the image for collection date and total.','ZK-4821','Where is my bill for the framed artwork order?','studio-order'],
  ['Shopping','Headphone return','Return unopened headphones in the original carton. Refund arrives five working days after warehouse inspection.','headphone refund','When will the shop put my money back after I send my earphones?'],
  ['Shopping','Restaurant lunch bill','Juniper Kitchen table receipt. Shared thali and masala chai. Total INR 875.50 including tax.','Juniper Kitchen receipt','Find the proof of what I paid for the meal at the cafe.'],
  ['Personal','Sourdough notes','Fold the dough four times during bulk fermentation. Bake with steam in a covered Dutch oven.','sourdough Dutch oven','How did I make that crusty fermented bread at home?'],
  ['Personal','Balcony plants','The north-facing railing gets indirect light. Put mint and pothos near the window and leave basil on the bright ledge.','balcony pothos','Which houseplants can grow in the shaded corner of my apartment?'],
  ['Personal','Library archive print','Photograph of the archive slip for a print box and its viewing time.','VELVET-513','When can I see the printed material in the library cabinet?','subtle-print'],
  ['Travel','River terminal ticket','Boarding card screenshot for a rail departure. The train reservation code is stored in the image.','TR-9542','Where is my train ticket and what time does transport depart?','travel-board'],
  ['Travel','Guesthouse reservation','Two nights at Amber Court Guesthouse in Kochi. Late check-in accepted until 22:00. Booking #KO-2816.','KO-2816','Find my place to stay in Kochi when I arrive at night.'],
  ['Travel','Coastal flight itinerary','The outbound flight uses Terminal 2. Check in online and pack the power bank in carry-on.','flight Terminal 2','Which airport gate building should I go to and where does the battery travel?'],
  ['Health','Physiotherapy booking','Clinic confirmed a physiotherapy intake appointment at 16:15. Bring previous referral note.','physiotherapy intake','Where is the visit I scheduled with the movement therapist?'],
  ['Health','Wellness walk journal','Track morning walks, rest, and how the ankle feels. Record observations to discuss at the next check-in.','ankle walk journal','Where did I track how my foot felt after walking?'],
  ['Health','Clinic admin notes','Clinic desk asked for an identification card, appointment email, and a list of current medicines.','clinic medicines list','What should I take with me when I meet the doctor?'],
  ['Tasks','Museum errands','TODO: return borrowed museum catalog\nPick up framers tape near the station after lunch.','return museum catalog','What book errand did I promise to do before going home?'],
  ['Tasks','Water meter reminder','Action: photograph the water meter reading. Submit by 28/11/2026 to the building office.','water meter submit','What household utility proof needs sending to apartment management?'],
  ['Tasks','Capstone upload checklist','TODO: upload the final capstone PDF\nSubmit by 30/11/2026 after checking page numbering.','capstone upload','What do I need to hand in after checking the pagination?'],
  ['Technology','Monorepo build notes','Vite resolves import aliases for the browser package. Clear the dependency cache after changing the shared TypeScript config.','Vite alias monorepo','How did I fix browser imports across packages that share configuration?'],
  ['Technology','Machine learning notes','Sparse retrieval compares lexical token counts. Sentence embeddings map similar concepts together even with different wording.','sentence embedding lexical','Find the note explaining how search can match meaning without exact words.'],
  ['Technology','Container networking link','Docker bridge networks assign private addresses and publish selected ports to the host.','Docker bridge port','Where did I save how isolated containers expose services?'],
  ['References','Optics field guide','Reference for glass caustics: a polished solid refracts nearby highlights onto the matte ground.','optics caustics','Find the article on bright light patterns cast through curved glass.'],
  ['References','Museum design catalogue','Reading list entry about early industrial graphic grids, utilitarian lettering and modular symbols.','graphic grids catalogue','Where is the catalogue of functional lettering and industrial symbols?'],
  ['References','Climate data bookshelf','Bookmark the marine archive methodology for estimating sea surface temperatures from buoy records.','marine buoy methodology','Which reading explains how floating instruments measure ocean warmth?'],
]

export function makeCorpus() {
  const clips = [], queries = []
  for (const [index, scenario] of scenarios.entries()) {
    const [category, title, body, exact, paraphrase, fixture] = scenario
    const key = 's' + String(index + 1).padStart(2, '0')
    const base = { kind: 'text', created: 1_750_000_000_000 + index * 70_000, collection: category, category }
    clips.push(
      { ...base, id: key + '-main', title, body, fixture, kind: fixture ? (fixture.includes('pdf') || ['two-pages', 'scanned-invoice'].includes(fixture) ? 'file' : 'image') : index % 5 === 2 ? 'link' : 'text' },
      { ...base, id: key + '-working', title: 'Working copy · ' + title, body: 'Draft reference for ' + title.toLowerCase() + '. ' + body },
      { ...base, id: key + '-context', title: 'Reading and research index', kind: 'link', body: 'https://example.test/references/' + key + '\nA reference list for ' + category.toLowerCase() + ' and related planning.' },
      { ...base, id: key + '-schedule', title: 'Organizing note', body: 'Remember to filter old items, review pinned notes, and make a weekly backup. This item was used to plan a general ' + category.toLowerCase() + ' queue.' },
      { ...base, id: key + '-record', title: 'Archived memo · ' + key, kind: index % 4 === 0 ? 'file' : 'text', body: ['Check the address and save a map without changing the account.', 'The weather looks unsettled. Pack a jacket and print the agenda.', 'Archived file transfer receipts and parcel pickup checklist.'][index % 3] },
    )
    const split = index % 3 === 0 ? 'development' : 'held-out'
    queries.push(
      { id: key + '-exact', split, type: fixture ? 'document-dependent' : 'keyword', query: exact, relevant: fixture ? { [key + '-main']: 2 } : { [key + '-main']: 2, [key + '-working']: 1 } },
      { id: key + '-concept', split, type: index % 6 === 0 ? 'ambiguous' : 'paraphrase', query: paraphrase, relevant: { [key + '-main']: 2, [key + '-working']: 1 } },
    )
  }
  return { clips, queries, collections: [...new Set(clips.map(clip => clip.category))].map(name => ({ id: name, name, color: '#888888' })) }
}
