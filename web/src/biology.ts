import type { WeaponKind } from "./weapons.js";
import type { Behaviour, Size } from "./behaviour.js";
import type { Facing } from "./motion.js";
// The Winogradsky redox tower as game data.
//
// ORDERING PRINCIPLE: strata descend the terminal-electron-accepting-process
// (TEAP) sequence, O2 > NO3- > Mn(IV) > Fe(III) > SO4 > CO2. Free energy per
// electron falls as you go, so depth is difficulty, loot tier and energy
// economy on one axis.
//
// Fe(III) reduction sits ABOVE sulfate reduction and methanogenesis, not at the
// bottom: in real columns Fe2+ DECLINES below ~50 cm as sulfide precipitates it
// as FeS -- which is what blackens the sediment -- and methanogenesis is the
// floor.
//   Pelletier et al. 2017, FEMS Microbiol Ecol 93:fix089
//   Rundell et al. 2014, PLoS ONE 9:e104134  (16S survey by depth)
//   Madigan et al., Brock Biology of Microorganisms  (redox tower)
//
// E0' are midpoint potentials at pH 7 in mV. Fe(III)/Fe(II) is deliberately set
// near zero: it swings roughly -100..+100 mV at circumneutral pH depending on
// mineral phase (ferrihydrite vs goethite vs magnetite). The +770 mV textbook
// figure is the pH 2 aqueous couple and does not apply here.

export type GeneId =
  | "psbA" | "cbbL" | "katG" | "amoA" | "narG" | "nosZ" | "nifH"
  | "soxB" | "sqr"  | "mtrC" | "omcS" | "pufM" | "fmoA" | "csmA"
  | "aclB" | "dsrA" | "aprA" | "hydA" | "mcrA" | "hdrB" | "ori"
  | "nirS" | "norB" | "sat" | "nxrA" | "luxAB"
  | "chiA" | "celA" | "dspB"
  | "bd" | "cbbM" | "nifD" | "anfG" | "phsA" | "ttrA" | "frdA" | "cooS" | "pceA" | "arsC" | "arrA" | "mnhA" | "atpB" | "groL" | "dnaK" | "recA" | "uvrA" | "cheA" | "flhD" | "pilA"
  | "ccoN" | "cyoA" | "sodA" | "psaA" | "hao" | "nrfA" | "napA" | "mtrB" | "cymA" | "mtoA" | "pioA" | "pufL" | "crtI" | "bchG" | "dsrB" | "qmoA" | "hynL" | "cdhA" | "ackA" | "fwdB"
  // v1.11: the thin pathways. `methane` had two genes against nitrogen's
  // twelve, and pathway membership drives the operon synergy bonus -- so a
  // thin pathway is not merely fewer options, it is a build that cannot
  // come together.
  | "pmoA" | "mmoX" | "frhA" | "mtrH" | "hzsA" | "hdh" | "acsB" | "otsA" | "cspA";

export type Teap = "O2" | "NO3-" | "Mn(IV)" | "Fe(III)" | "S0" | "H2S" | "SO4" | "CO2";

export interface Gene {
  /** When this was first described, and by whom. Every one of these is real:
   *  the point of the game is the organisms and the chemistry, and a made-up
   *  citation would undercut that. */
  readonly discovery: string;
  readonly id: GeneId; readonly name: string; readonly kb: number;
  readonly product: string; readonly tier: number; readonly desc: string;
  /** Real operons cluster genes of one pathway. Same-pathway neighbours in an
   *  operon co-regulate, and the plasmid rewards reproducing that. */
  readonly pathway: Pathway;
}

export type Pathway =
  | "photo" | "carbon" | "nitrogen" | "sulfur" | "iron"
  | "methane" | "energy" | "defense" | "core";

export const GENES: Readonly<Record<GeneId, Gene>> = {
  psbA: { id:"psbA", name:"psbA", kb:1.1, product:"PSII D1 protein",               tier:1, desc:"Harvest light. Photodamaged constantly; needs repair.", discovery:"The D1 protein sits at the heart of Photosystem II. Deisenhofer and Michel solved the first reaction-centre structure in 1985 and shared the 1988 Nobel for it.", pathway:"photo" },
  cbbL: { id:"cbbL", name:"cbbL", kb:1.4, product:"RuBisCO large subunit",         tier:1, desc:"Fix CO2 into biomass. Slow, universal.", discovery:"RuBisCO was isolated from spinach in 1947 as 'Fraction I protein', before anyone knew what it did. It is now thought to be the most abundant enzyme on Earth.", pathway:"carbon" },
  katG: { id:"katG", name:"katG", kb:2.2, product:"catalase-peroxidase",           tier:1, desc:"Detoxify H2O2. The oxic zone is corrosive without it.", discovery:"The bifunctional catalase-peroxidase HPI was characterised in E. coli by Claiborne and Fridovich in 1979. It is also the enzyme that activates isoniazid, which is why TB resistance so often maps to katG.", pathway:"defense" },
  amoA: { id:"amoA", name:"amoA", kb:0.8, product:"ammonia monooxygenase A",       tier:2, desc:"Oxidise NH3. A steady trickle.", discovery:"Ammonia monooxygenase resisted purification for decades because it falls apart outside the membrane. amoA was finally sequenced from Nitrosomonas europaea in the early 1990s.", pathway:"nitrogen" },
  narG: { id:"narG", name:"narG", kb:3.7, product:"nitrate reductase alpha",       tier:2, desc:"Respire nitrate once oxygen runs out.", discovery:"Respiratory nitrate reductase from E. coli, worked out through the 1970s and 80s. A molybdenum enzyme that lets a cell keep breathing after the oxygen has gone.", pathway:"nitrogen" },
  nosZ: { id:"nosZ", name:"nosZ", kb:1.9, product:"N2O reductase",                 tier:2, desc:"Complete denitrification. Vents N2.", discovery:"Nitrous oxide reductase was purified by Zumft and Matsubara in 1982. It carries a copper centre unlike any other, and it is the only enzyme known to destroy N2O.", pathway:"nitrogen" },
  nifH: { id:"nifH", name:"nifH", kb:0.9, product:"nitrogenase Fe protein",        tier:4, desc:"Fix N2. Ruinously expensive; oxygen destroys it.", discovery:"Nitrogen fixation was traced to living bacteria by Beijerinck around 1901. nifH is now the gene ecologists sequence to ask who, in any given mud, is fixing nitrogen.", pathway:"nitrogen" },
  soxB: { id:"soxB", name:"soxB", kb:1.7, product:"thiosulfate oxidation SoxB",    tier:3, desc:"Oxidise reduced sulfur at the O2/H2S front.", discovery:"The Sox multienzyme system was assembled piece by piece from Paracoccus through the 1990s, and described as a complete pathway by Friedrich and colleagues in 2001.", pathway:"sulfur" },
  sqr:  { id:"sqr",  name:"sqr",  kb:1.3, product:"sulfide:quinone oxidoreductase",tier:3, desc:"Feed sulfide to the quinone pool. Sulfide tolerance.", discovery:"Sulfide:quinone oxidoreductase was identified in the 1990s as the enzyme that lets a phototroph use sulfide without being poisoned by it. Human mitochondria carry a homologue.", pathway:"sulfur" },
  mtrC: { id:"mtrC", name:"mtrC", kb:2.1, product:"decaheme cytochrome MtrC",      tier:4, desc:"Dump electrons onto solid Fe(III). Respire minerals.", discovery:"Shewanella oneidensis was pulled out of Lake Oneida in 1988 by Myers and Nealson, who found it respiring manganese. MtrC is the outer-membrane cytochrome that puts the electrons onto the mineral.", pathway:"iron" },
  omcS: { id:"omcS", name:"omcS", kb:1.2, product:"OmcS nanowire cytochrome",      tier:4, desc:"Conductive filament. Strike along a wire.", discovery:"Geobacter's conductive pili were reported by Reguera and Lovley in 2005 and argued about for a decade. Cryo-EM in 2019 showed the filaments are polymerised OmcS, haems stacked end to end.", pathway:"iron" },
  pufM: { id:"pufM", name:"pufM", kb:1.0, product:"type-2 RC subunit M",           tier:5, desc:"Anoxygenic photosynthesis. Light without oxygen.", discovery:"The purple bacterial reaction centre was the first membrane protein structure ever solved, by Deisenhofer, Huber and Michel in 1985. Everything we know about photosynthesis is built on it.", pathway:"photo" },
  fmoA: { id:"fmoA", name:"fmoA", kb:1.1, product:"Fenna-Matthews-Olson protein",  tier:6, desc:"Near-lossless excitonic funnel. Works in near-darkness.", discovery:"The Fenna-Matthews-Olson protein was solved by Fenna and Matthews in 1975 -- the first chlorophyll-containing protein structure of any kind. It funnels excitons with almost no loss.", pathway:"photo" },
  csmA: { id:"csmA", name:"csmA", kb:0.2, product:"chlorosome envelope CsmA",      tier:6, desc:"Chlorosome antenna. Enormous absorption cross-section.", discovery:"Chlorosomes were described in green sulfur bacteria in the 1960s. They are the largest light-harvesting antenna in biology and contain almost no protein at all.", pathway:"photo" },
  aclB: { id:"aclB", name:"aclB", kb:1.2, product:"ATP citrate lyase beta",        tier:6, desc:"Reverse TCA carbon fixation. Cheaper than Calvin.", discovery:"Evans, Buchanan and Arnon described the reductive TCA cycle in 1966, showing that the citric acid cycle can be run backwards to fix carbon. It was controversial for years.", pathway:"carbon" },
  dsrA: { id:"dsrA", name:"dsrA", kb:1.3, product:"dissimilatory sulfite reductase A", tier:7, desc:"Respire sulfate. Exhales H2S.", discovery:"Desulfovibrio was described by Beijerinck in 1895. The green pigment desulfoviridin turned out to be dissimilatory sulfite reductase, and the smell of black mud is its product.", pathway:"sulfur" },
  aprA: { id:"aprA", name:"aprA", kb:1.9, product:"APS reductase alpha",           tier:7, desc:"Activate sulfate for reduction.", discovery:"APS reductase was worked out by Peck around 1960, resolving how sulfate -- too stable to reduce directly -- is first activated at the cost of ATP.", pathway:"sulfur" },
  hydA: { id:"hydA", name:"hydA", kb:1.7, product:"[FeFe] hydrogenase",            tier:7, desc:"Run on hydrogen. Oxygen-labile within minutes.", discovery:"Hydrogenase was described by Stephenson and Stickland in 1931, in one of the first papers to treat bacterial metabolism as enzymology. The [FeFe] class is the fastest known.", pathway:"energy" },
  mcrA: { id:"mcrA", name:"mcrA", kb:1.5, product:"methyl-CoM reductase alpha",    tier:8, desc:"Reduce CO2 to methane. The last acceptor.", discovery:"Coenzyme M was found in Wolfe's laboratory in 1974, the smallest known coenzyme. Methyl-CoM reductase, which uses it, performs the last step of the last respiration on Earth.", pathway:"methane" },
  hdrB: { id:"hdrB", name:"hdrB", kb:0.8, product:"heterodisulfide reductase B",   tier:8, desc:"Flavin-based electron bifurcation.", discovery:"Heterodisulfide reductase was characterised by Thauer and colleagues, and later became the founding example of flavin-based electron bifurcation -- a third way of conserving energy, described in 2008.", pathway:"methane" },
  nirS: { id:"nirS", name:"nirS", kb:1.7, product:"cytochrome cd1 nitrite reductase", tier:2, desc:"NO2- to NO. The committed step of denitrification.", discovery:"The cd1 nitrite reductase was first described as a curious cytochrome in the 1950s. Its haem d1 is found nowhere else in biology.", pathway:"nitrogen" },
  norB: { id:"norB", name:"norB", kb:1.4, product:"nitric oxide reductase B",        tier:2, desc:"NO to N2O. Clears a radical that would otherwise kill you.", discovery:"Nitric oxide reductase is structurally a member of the same family as the oxygen reductases -- evidence that aerobic respiration was built out of denitrification machinery.", pathway:"nitrogen" },
  sat:  { id:"sat",  name:"sat",  kb:1.2, product:"ATP sulfurylase",                 tier:3, desc:"Activates sulfate to APS. Nothing downstream runs without it.", discovery:"ATP sulfurylase was described by Wilson and Bandurski in 1958. It spends two ATP to make sulfate reactive at all, which is why sulfate respiration is such thin living.", pathway:"sulfur" },
  nxrA: { id:"nxrA", name:"nxrA", kb:3.4, product:"nitrite oxidoreductase alpha",   tier:2, desc:"NO2- to NO3-. A nitrate reductase running the other way.", discovery:"Nitrite oxidation was described by Sergei Winogradsky in 1890 -- the same Winogradsky whose column you are descending. He proved a living thing could grow on nothing but rock and air.", pathway:"nitrogen" },
  luxAB: { id:"luxAB", name:"luxAB", kb:2.1, product:"bacterial luciferase", tier:2, desc:"Emits blue-green light. Luciferase is an oxygenase: no O2, no glow.", discovery:"Bacterial luciferase came from Vibrio fischeri, the squid symbiont. The lux operon was cloned in 1983 and became the first widely used reporter gene.", pathway:"defense" },
  chiA: { id:"chiA", name:"chiA", kb:1.7, product:"chitinase A",                  tier:1, desc:"Cuts chitin. Sediments are full of arthropod and fungal debris.", discovery:"Serratia marcescens chitinase A was cloned in the 1980s. Chitin is the second most abundant polymer on Earth and almost all of it is recycled by bacteria like this one.", pathway:"carbon" },
  celA: { id:"celA", name:"celA", kb:1.5, product:"endoglucanase",                tier:1, desc:"Cuts cellulose. Plant material sinks and settles.", discovery:"Clostridium thermocellum's cellulases were among the first cloned, in the early 1980s. The organism assembles them into a cellulosome, one of the most efficient degradation machines known.", pathway:"carbon" },
  dspB: { id:"dspB", name:"dspB", kb:1.1, product:"dispersin B, a glycoside hydrolase", tier:1, desc:"Dissolves the poly-GlcNAc that holds a biofilm together.", discovery:"Dispersin B was described by Kaplan and colleagues in 2003, from a bacterium that lives in dental plaque. It dissolves the very biofilm its host builds.", pathway:"defense" },
  ccoN: { id:"ccoN", name:"ccoN", kb:1.6, product:"cbb3 oxidase subunit I", tier:3, desc:"Oxygen reductase with extreme O2 affinity. Works where O2 is nearly gone, which is where the competition is not.", discovery:"Cytochrome cbb3 was characterised in the 1990s as the oxidase microaerophiles use; its affinity for O2 is a hundredfold tighter than the standard one.", pathway:"energy" },
  cyoA: { id:"cyoA", name:"cyoA", kb:1.4, product:"bo3 ubiquinol oxidase", tier:2, desc:"The high-flux, low-affinity oxidase. Cheap and fast while O2 is plentiful.", discovery:"The bo3 oxidase of E. coli was separated from its high-affinity partner bd in the 1980s, when it became clear the cell keeps two and switches between them.", pathway:"energy" },
  sodA: { id:"sodA", name:"sodA", kb:0.9, product:"manganese superoxide dismutase", tier:2, desc:"Destroys superoxide. Oxygen is only survivable because of enzymes like this.", discovery:"McCord and Fridovich showed in 1969 that a known copper protein was in fact an enzyme destroying superoxide -- the discovery that made oxygen toxicity a chemistry problem.", pathway:"defense" },
  psaA: { id:"psaA", name:"psaA", kb:2.3, product:"photosystem I P700 apoprotein", tier:4, desc:"The reducing end of oxygenic photosynthesis. Pushes electrons uphill to ferredoxin.", discovery:"Photosystem I was resolved at atomic detail in 2001 by Jordan and colleagues, revealing ninety-six chlorophylls held in a single complex.", pathway:"photo" },
  hao: { id:"hao", name:"hao", kb:1.8, product:"hydroxylamine oxidoreductase", tier:3, desc:"Oxidises hydroxylamine, the intermediate that makes ammonia oxidation possible.", discovery:"HAO carries seven c-type haems plus the unique catalytic P460; its structure was solved by Igarashi and colleagues in 1997.", pathway:"nitrogen" },
  nrfA: { id:"nrfA", name:"nrfA", kb:1.5, product:"cytochrome c nitrite reductase", tier:3, desc:"Reduces nitrite straight to ammonium. Six electrons in one step, and the nitrogen stays in the system.", discovery:"NrfA performs dissimilatory nitrate reduction to ammonium -- a competing fate to denitrification, and the reason some sediments retain nitrogen instead of losing it.", pathway:"nitrogen" },
  napA: { id:"napA", name:"napA", kb:2.5, product:"periplasmic nitrate reductase", tier:3, desc:"Reduces nitrate outside the membrane, and unlike narG it does not care whether oxygen is present.", discovery:"Nap was distinguished from the membrane-bound reductase in the 1990s; it works aerobically, which the classical enzyme cannot.", pathway:"nitrogen" },
  mtrB: { id:"mtrB", name:"mtrB", kb:2.1, product:"Mtr outer membrane porin", tier:4, desc:"The barrel that threads the cytochromes through the outer membrane. Without it the electrons never reach the mineral.", discovery:"MtrB was identified as essential to metal reduction in Shewanella before anyone knew it was a porin holding MtrA and MtrC in register.", pathway:"iron" },
  cymA: { id:"cymA", name:"cymA", kb:1.1, product:"inner membrane quinol dehydrogenase", tier:3, desc:"The hub. Takes electrons off the quinone pool and hands them to whichever branch is running.", discovery:"CymA is the junction Shewanella routes almost every anaerobic respiration through -- iron, manganese, nitrate, fumarate, DMSO.", pathway:"iron" },
  mtoA: { id:"mtoA", name:"mtoA", kb:2.4, product:"Fe(II)-oxidising decaheme cytochrome", tier:5, desc:"Runs the Mtr machinery backwards: takes electrons OFF iron rather than putting them on.", discovery:"Mto was described in Sideroxydans in 2012, showing the same architecture that reduces iron can be used to oxidise it.", pathway:"iron" },
  pioA: { id:"pioA", name:"pioA", kb:2.2, product:"phototrophic Fe(II) oxidoreductase", tier:6, desc:"Photoferrotrophy: light-driven iron oxidation. This chemistry laid down the banded iron formations.", discovery:"Widdel and colleagues reported anoxygenic phototrophs growing on Fe(II) in 1993, providing a mechanism for banded iron formations that needed no oxygen at all.", pathway:"iron" },
  pufL: { id:"pufL", name:"pufL", kb:1.0, product:"reaction centre L subunit", tier:4, desc:"The other half of the purple bacterial reaction centre. L and M are pseudo-symmetric and only one branch conducts.", discovery:"The L and M subunits are near-mirror images, yet electrons travel down only one of them -- an asymmetry still not fully explained.", pathway:"photo" },
  crtI: { id:"crtI", name:"crtI", kb:1.5, product:"phytoene desaturase", tier:3, desc:"Builds the carotenoids that quench excess light before it destroys the reaction centre.", discovery:"CrtI was cloned from Rhodobacter in the 1980s and became one of the first tools for engineering carotenoid pathways.", pathway:"photo" },
  bchG: { id:"bchG", name:"bchG", kb:1.4, product:"bacteriochlorophyll synthase", tier:4, desc:"Attaches the phytol tail. The last committed step to a working antenna pigment.", discovery:"The bch genes were mapped in the photosynthesis gene cluster of Rhodobacter, one of the first complete pathways assembled from genetics alone.", pathway:"photo" },
  dsrB: { id:"dsrB", name:"dsrB", kb:1.3, product:"dissimilatory sulfite reductase beta", tier:6, desc:"The other half of the siroheme enzyme. Without it dsrA is a subunit, not a pathway.", discovery:"dsrAB is the standard marker for sulfate reducers in the environment, and its phylogeny is deep enough to argue about early life.", pathway:"sulfur" },
  qmoA: { id:"qmoA", name:"qmoA", kb:1.7, product:"quinone-interacting oxidoreductase", tier:6, desc:"Delivers electrons to APS reductase. The step that makes sulfate respiration energetically possible at all.", discovery:"Qmo was characterised in Desulfovibrio in the 2000s and is now understood to run electron bifurcation.", pathway:"sulfur" },
  hynL: { id:"hynL", name:"hynL", kb:2.6, product:"[NiFe] hydrogenase large subunit", tier:5, desc:"The nickel-iron class. Slower than [FeFe] and far more tolerant of oxygen.", discovery:"The first [NiFe] hydrogenase structure came from Desulfovibrio gigas in 1995 -- the first look at a nickel-iron active site of any kind.", pathway:"energy" },
  cdhA: { id:"cdhA", name:"cdhA", kb:2.8, product:"CO dehydrogenase / acetyl-CoA synthase", tier:7, desc:"Makes and breaks the carbon-carbon bond of acetyl-CoA directly. The Wood-Ljungdahl pathway.", discovery:"Ljungdahl and Wood worked this out over decades; it is the only carbon fixation route that also conserves energy, and may be the oldest.", pathway:"carbon" },
  ackA: { id:"ackA", name:"ackA", kb:1.2, product:"acetate kinase", tier:4, desc:"Substrate-level phosphorylation from acetate. ATP without a membrane gradient.", discovery:"Acetate kinase was among the first enzymes shown to make ATP outside respiration, and remains the textbook case of substrate-level phosphorylation.", pathway:"carbon" },
  fwdB: { id:"fwdB", name:"fwdB", kb:1.9, product:"formylmethanofuran dehydrogenase", tier:7, desc:"Fixes CO2 onto methanofuran. The first committed step of methanogenesis, and it uses tungsten.", discovery:"The tungsten-containing formylmethanofuran dehydrogenase is one of very few biological uses of tungsten, found where molybdenum is scarce.", pathway:"carbon" },
  bd: { id:"bd", name:"bd", kb:1.4, product:"cytochrome bd oxidase", tier:3, desc:"A second oxidase with even tighter O2 affinity, and it makes no proton gradient. Pure survival, not profit.", discovery:"Cytochrome bd was distinguished from the bo3 oxidase in the 1980s; it lets a cell keep respiring at oxygen tensions where nothing else will.", pathway:"energy" },
  cbbM: { id:"cbbM", name:"cbbM", kb:1.4, product:"RuBisCO form II", tier:3, desc:"The anaerobe's RuBisCO. Poor at telling CO2 from O2, which does not matter where there is no O2.", discovery:"Form II RuBisCO from Rhodospirillum was recognised in the 1970s as a distinct lineage -- simpler, faster, and hopeless in air.", pathway:"carbon" },
  nifD: { id:"nifD", name:"nifD", kb:3.2, product:"nitrogenase MoFe protein alpha", tier:6, desc:"The half of nitrogenase that actually holds the FeMo cofactor where N2 is broken.", discovery:"The FeMo cofactor structure was solved by Rees and colleagues in 1992, revealing a metal cluster unlike anything else in biology.", pathway:"nitrogen" },
  anfG: { id:"anfG", name:"anfG", kb:2.9, product:"iron-only nitrogenase", tier:7, desc:"The alternative nitrogenase, used when molybdenum runs out. Slower, and it works.", discovery:"Alternative nitrogenases were confirmed in the 1980s after decades of doubt, showing biology keeps a spare for its hardest reaction.", pathway:"nitrogen" },
  phsA: { id:"phsA", name:"phsA", kb:2.2, product:"thiosulfate reductase", tier:5, desc:"Reduces thiosulfate to sulfide. A shortcut through the sulfur cycle that skips sulfate entirely.", discovery:"Thiosulfate respiration was characterised in Salmonella, and is the reason some gut and sediment bacteria produce sulfide so readily.", pathway:"sulfur" },
  ttrA: { id:"ttrA", name:"ttrA", kb:2.4, product:"tetrathionate reductase", tier:4, desc:"Respires tetrathionate, a sulfur species that appears wherever sulfide meets oxygen.", discovery:"Tetrathionate respiration became famous in 2010 when it was shown that inflammation generates the tetrathionate Salmonella then breathes.", pathway:"sulfur" },
  frdA: { id:"frdA", name:"frdA", kb:1.8, product:"fumarate reductase", tier:3, desc:"Runs succinate dehydrogenase backwards. The simplest anaerobic respiration there is.", discovery:"Fumarate reductase and succinate dehydrogenase were shown to be the same enzyme family running in opposite directions -- one of the tidier results in bioenergetics.", pathway:"energy" },
  cooS: { id:"cooS", name:"cooS", kb:2.1, product:"carbon monoxide dehydrogenase", tier:6, desc:"Oxidises CO, which is lethal to almost everything else, and banks the electrons.", discovery:"Carboxydotrophy was described in the 1970s: organisms that live on carbon monoxide, using a nickel-iron cluster no other enzyme has.", pathway:"carbon" },
  pceA: { id:"pceA", name:"pceA", kb:2.5, product:"reductive dehalogenase", tier:5, desc:"Respires chlorinated compounds, stripping chlorine to breathe. Organohalide respiration.", discovery:"Dehalococcoides was isolated in 1997 and can respire nothing but chlorinated solvents -- the organism that made bioremediation practical.", pathway:"energy" },
  arsC: { id:"arsC", name:"arsC", kb:0.7, product:"arsenate reductase", tier:4, desc:"Reduces arsenate to arsenite so it can be pumped out. Arsenic resistance, not metabolism.", discovery:"The ars operon was among the first bacterial resistance systems sequenced, in the early 1980s.", pathway:"defense" },
  arrA: { id:"arrA", name:"arrA", kb:2.6, product:"arsenate respiratory reductase", tier:6, desc:"Actually breathes arsenate. What is poison to most cells is an electron acceptor to this one.", discovery:"Arsenate respiration was demonstrated in the 1990s in bacteria from arsenic-rich sediments, extending the list of things life will breathe.", pathway:"energy" },
  mnhA: { id:"mnhA", name:"mnhA", kb:1.3, product:"Na+/H+ antiporter", tier:4, desc:"Trades sodium for protons. Some cells run their whole bioenergetics on sodium instead.", discovery:"Sodium bioenergetics was worked out largely in marine and alkaliphilic bacteria, showing the proton is not the only currency.", pathway:"energy" },
  atpB: { id:"atpB", name:"atpB", kb:0.9, product:"ATP synthase subunit a", tier:2, desc:"The rotor channel. Everything upstream exists so that this can turn.", discovery:"Boyer and Walker shared the 1997 Nobel for the rotary mechanism; Yoshida's group later filmed a single molecule turning.", pathway:"energy" },
  groL: { id:"groL", name:"groL", kb:1.7, product:"chaperonin GroEL", tier:2, desc:"A folding chamber. Nothing large folds reliably at depth without help.", discovery:"GroEL's barrel structure was solved in 1994 and settled a long argument about whether folding needed machinery at all.", pathway:"defense" },
  dnaK: { id:"dnaK", name:"dnaK", kb:1.9, product:"Hsp70 chaperone", tier:3, desc:"Holds unfolded protein until it can be dealt with. The stress response's first responder.", discovery:"The heat shock response was described in the 1960s in fruit flies and turned out to be near-universal, dnaK included.", pathway:"defense" },
  recA: { id:"recA", name:"recA", kb:1.1, product:"recombinase A", tier:3, desc:"Repairs broken DNA by homologous recombination, and switches on the SOS response when things get bad.", discovery:"RecA was purified in 1979 and is the ancestor of every recombinase since, including the eukaryotic RAD51.", pathway:"defense" },
  uvrA: { id:"uvrA", name:"uvrA", kb:2.8, product:"excision repair subunit A", tier:4, desc:"Finds and excises damaged bases. Ultraviolet is a surface problem, and the surface is where light is.", discovery:"Nucleotide excision repair was worked out in the 1960s; Sancar shared the 2015 Nobel for mapping it in detail.", pathway:"defense" },
  cheA: { id:"cheA", name:"cheA", kb:2.0, product:"chemotaxis histidine kinase", tier:4, desc:"The kinase at the centre of chemotaxis. Tells the flagellum which way not to go.", discovery:"Bacterial chemotaxis became the model two-component system after Adler's experiments in the 1960s showed bacteria genuinely choose.", pathway:"defense" },
  flhD: { id:"flhD", name:"flhD", kb:0.4, product:"flagellar master regulator", tier:2, desc:"Decides whether to build flagella at all. Motility is expensive and not always worth it.", discovery:"The flagellar regulon is one of the largest coordinated gene programmes known, and flhDC sits at the top of it.", pathway:"defense" },
  pilA: { id:"pilA", name:"pilA", kb:0.5, product:"type IV pilin", tier:3, desc:"The subunit Geobacter polymerises into conductive pili. Twitching motility, and wires.", discovery:"Type IV pili were long known for twitching motility before anyone suspected some of them conduct electrons.", pathway:"iron" },

  // --- added in v1.11: the thin strata and the thin pathways -------------
  //
  // `methane` had two genes against nitrogen's twelve, and D5 to D8 carried
  // seven or eight each against D2's eighteen. Since pathway membership drives
  // the operon synergy bonus, a thin pathway is not merely fewer options -- it
  // is a build that can never come together.

  pmoA: { id:"pmoA", name:"pmoA", kb:0.8, product:"particulate methane monooxygenase", tier:5, desc:"Oxidise methane to methanol. Eat the gas everything below you makes.", discovery:"Methanotrophs consume most of the methane produced in sediments before it ever reaches the atmosphere, which is why the seabed is not a chimney.", pathway:"methane" },
  mmoX: { id:"mmoX", name:"mmoX", kb:1.6, product:"soluble methane monooxygenase", tier:6, desc:"The copper-free version. Slower, and it works when copper runs out.", discovery:"Methanotrophs switch between the particulate and soluble enzymes on copper availability -- the 'copper switch', one of the cleanest examples of a metal regulating which enzyme a cell builds.", pathway:"methane" },
  frhA: { id:"frhA", name:"frhA", kb:1.3, product:"F420-reducing hydrogenase", tier:6, desc:"Feed electrons into methanogenesis from hydrogen.", discovery:"Coenzyme F420 fluoresces blue-green under UV, which is how methanogens were first identified in a sample before anyone could culture them.", pathway:"methane" },
  mtrH: { id:"mtrH", name:"mtrH", kb:1.0, product:"methyl-H4MPT methyltransferase", tier:7, desc:"The sodium-pumping step. Methanogenesis pays here or not at all.", discovery:"This complex pumps sodium rather than protons, and it is the only energy-conserving step in hydrogenotrophic methanogenesis.", pathway:"methane" },


  hzsA: { id:"hzsA", name:"hzsA", kb:2.4, product:"hydrazine synthase", tier:6, desc:"Make hydrazine from ammonium and nitrite. Rocket fuel, as an intermediate.", discovery:"Anammox was predicted thermodynamically in 1977 and not found until a Delft wastewater reactor kept losing ammonium in the 1990s. It turns out to produce a large share of the nitrogen gas in the ocean.", pathway:"nitrogen" },
  hdh:  { id:"hdh", name:"hdh", kb:1.7, product:"hydrazine dehydrogenase", tier:6, desc:"Oxidise hydrazine to N2. The step that pays for the previous one.", discovery:"Anammox bacteria hold hydrazine inside an anammoxosome bounded by ladderane lipids -- membranes built from fused cyclobutane rings, found nowhere else in biology.", pathway:"nitrogen" },

  acsB: { id:"acsB", name:"acsB", kb:2.1, product:"acetyl-CoA synthase", tier:6, desc:"Fix carbon on a nickel-iron cluster. The oldest way to do it.", discovery:"The Wood-Ljungdahl pathway is the only carbon fixation route that also conserves energy, and its nickel-iron-sulfur active site is often argued to be a relic of the first metabolism.", pathway:"carbon" },

  otsA: { id:"otsA", name:"otsA", kb:1.4, product:"trehalose-6-phosphate synthase", tier:3, desc:"Stack trehalose against osmotic shock. Survive drying out.", discovery:"Trehalose lets tardigrades and resurrection plants survive desiccation by replacing the water around their proteins -- vitrification rather than repair.", pathway:"defense" },
  cspA: { id:"cspA", name:"cspA", kb:0.4, product:"cold shock protein A", tier:2, desc:"Keep RNA from folding shut in the cold. Cheap and always useful.", discovery:"CspA can reach a tenth of total cell protein within minutes of a temperature drop, one of the fastest known responses to a physical stress.", pathway:"defense" },

  ori:  { id:"ori",  name:"oriV", kb:0.7, product:"broad-host-range origin",       tier:0, desc:"Origin of replication. Without one, nothing replicates.", discovery:"Broad-host-range origins like those of RK2 and RSF1010 were characterised in the 1970s and 80s. Without one a plasmid is just a linear piece of DNA that vanishes at the next division.", pathway:"core" },
};

export interface Microbe {
  readonly id: string; readonly name: string; readonly depth: number;
  readonly hp: number; readonly atk: number; readonly glyph: string;
  readonly genes: readonly GeneId[]; readonly note: string;
  /** Actual pigmentation, not a stratum tint. Also guarantees the organism
   *  contrasts with the wall, which a stratum-derived colour did not. */
  readonly pigment: string;
  /** Elongate cells align with motion; cocci, sarcinae and holdfast-anchored
   *  filaments do not. Rotating a sphere is invisible, and rotating an
   *  anchored organism is wrong. */
  readonly facing: Facing;
  /** Motility pattern. Real: gliding, flagellar chase, Brownian drift and
   *  holdfast attachment are distinct and diagnostic. */
  readonly behaviour: Behaviour;
  readonly size: Size;
  /** How it attacks. Follows what the organism actually secretes: T6SS for
   *  Pseudomonas, a nanowire for Geobacter, sulfuric acid for Thiobacillus. */
  readonly weapon: WeaponKind;
}

export const MICROBES: readonly Microbe[] = [
  { id:"synechococcus",   name:"Synechococcus",   depth:1, hp:6,  atk:2,  glyph:"s", genes:["psbA","cbbL","luxAB","psaA","atpB","recA"], note:"Oxygenic picocyanobacterium. Vents O2 that burns you." , pigment:"#4ec9c0" , facing:"rotate" , behaviour:"drift", size:"pico" , weapon:"melee" },
  { id:"chlorella",       name:"Chlorella",       depth:1, hp:8,  atk:1,  glyph:"c", genes:["cbbL","katG","luxAB","celA","sodA","uvrA","groL"], note:"Green alga. Passive, tough cell wall." , pigment:"#7ed957" , facing:"none" , behaviour:"drift", size:"small" , weapon:"melee" },
  { id:"nitzschia",       name:"Nitzschia",       depth:1, hp:10, atk:3,  glyph:"d", genes:["psbA","katG","psaA","sodA","uvrA","atpB"], note:"Pennate diatom. Silica frustule; glides." , pigment:"#d4a24c" , facing:"rotate" , behaviour:"glide", size:"medium" , weapon:"melee" },
  { id:"nitrosomonas",    name:"Nitrosomonas",    depth:2, hp:9,  atk:3,  glyph:"n", genes:["amoA","hao","dnaK","cheA","hzsA","hdh"],        note:"Ammonia oxidiser. Acidifies its surroundings." , pigment:"#cbbb9c" , facing:"rotate" , behaviour:"drift", size:"small" , weapon:"melee" },
  { id:"nitrobacter",     name:"Nitrobacter",     depth:2, hp:9,  atk:3,  glyph:"N", genes:["nxrA","cyoA","bd","frdA"],        note:"Nitrite oxidiser. Completes nitrification." , pigment:"#bfae8e" , facing:"rotate" , behaviour:"drift", size:"small" , weapon:"melee" },
  { id:"pseudomonas",     name:"Pseudomonas",     depth:2, hp:12, atk:4,  glyph:"p", genes:["narG","nirS","norB","nosZ","dspB","napA","nrfA","ccoN","frdA","flhD","cheA","arsC"], note:"Facultative denitrifier. Carries the whole chain." , pigment:"#cfe04a" , facing:"rotate" , behaviour:"chase", size:"medium" , weapon:"spear" },
  { id:"beggiatoa",       name:"Beggiatoa",       depth:3, hp:16, atk:5,  glyph:"B", genes:["soxB","sqr","chiA","cymA","bd","phsA"],  note:"Gliding sulfur mat. Stores S0 granules internally." , pigment:"#f2f2e6" , facing:"rotate" , behaviour:"glide", size:"filament" , weapon:"melee" },
  { id:"thiothrix",       name:"Thiothrix",       depth:3, hp:14, atk:5,  glyph:"t", genes:["soxB","phsA","groL"],        note:"Filamentous, rosette-forming sulfur oxidiser." , pigment:"#e6e6da" , facing:"none" , behaviour:"sessile", size:"filament" , weapon:"melee" },
  { id:"thiobacillus",    name:"Thiobacillus",    depth:3, hp:11, atk:6,  glyph:"T", genes:["sqr","soxB","ttrA","arsC"],  note:"Chemolithoautotroph. Generates sulfuric acid." , pigment:"#d8cfa0" , facing:"rotate" , behaviour:"drift", size:"small" , weapon:"cloud" },
  { id:"geobacter",       name:"Geobacter",       depth:4, hp:18, atk:7,  glyph:"G", genes:["omcS","mtrC","dspB","mtrB","cymA","pilA","arrA"], note:"Grows conductive pili. Reduces solid Fe(III) oxides." , pigment:"#d0603c" , facing:"rotate" , behaviour:"wire", size:"medium" , weapon:"bolt" },
  { id:"shewanella",      name:"Shewanella",      depth:4, hp:16, atk:6,  glyph:"S", genes:["mtrC","mtrB","cymA","mtoA","arrA","ttrA","frdA"],        note:"Mtr pathway respires minerals. Wildly versatile." , pigment:"#dd9078" , facing:"rotate" , behaviour:"chase", size:"medium" , weapon:"melee" },
  { id:"rhodospirillum",  name:"Rhodospirillum",  depth:4, hp:15, atk:5,  glyph:"r", genes:["pufM","nifH","crtI","cbbM","cooS","nifD"], note:"Purple non-sulfur. Photoheterotroph, fixes N2." , pigment:"#b0527a" , facing:"rotate" , behaviour:"chase", size:"medium" , weapon:"melee" },
  { id:"allochromatium",  name:"Allochromatium",  depth:5, hp:22, atk:8,  glyph:"C", genes:["pufM","sqr","pufL","crtI","cbbM","nifD"],  note:"Purple sulfur. Intracellular S0 globules." , pigment:"#b34a86" , facing:"rotate" , behaviour:"swarm", size:"large" , weapon:"melee" },
  { id:"thiocapsa",       name:"Thiocapsa",       depth:5, hp:20, atk:8,  glyph:"h", genes:["pufM","crtI","pioA","pufL","nifD","anfG"],        note:"Purple sulfur, capsulate. Colonies in slime." , pigment:"#a34fa8" , facing:"none" , behaviour:"sessile", size:"large" , weapon:"melee" },
  { id:"chlorobium",      name:"Chlorobium",      depth:6, hp:24, atk:9,  glyph:"L", genes:["fmoA","csmA","bchG","pioA","anfG","dnaK","cspA"], note:"Green sulfur. Photosynthesis at near-zero photon flux." , pigment:"#5fd47a" , facing:"rotate" , behaviour:"drift", size:"medium" , weapon:"melee" },
  { id:"prosthecochloris",name:"Prosthecochloris",depth:6, hp:22, atk:10, glyph:"P", genes:["csmA","aclB","bchG"], note:"Prosthecate green sulfur. Fixes carbon via rTCA." , pigment:"#4fc98e" , facing:"none" , behaviour:"sessile", size:"medium" , weapon:"packet" },
  { id:"desulfovibrio",   name:"Desulfovibrio",   depth:7, hp:28, atk:11, glyph:"D", genes:["dsrA","hydA","dsrB","qmoA","hynL","pceA","mnhA","otsA"], note:"Sulfate reducer. Exhaled H2S blackens the sediment." , pigment:"#a6acb6" , facing:"rotate" , behaviour:"chase", size:"medium" , weapon:"cloud" },
  { id:"desulfobacter",   name:"Desulfobacter",   depth:7, hp:30, atk:12, glyph:"b", genes:["dsrA","aprA","sat","qmoA","hynL","dsrB","pceA","cooS","mnhA"], note:"Oxidises acetate completely to CO2." , pigment:"#949ba6" , facing:"rotate" , behaviour:"drift", size:"large" , weapon:"melee" },
  { id:"methanosarcina",  name:"Methanosarcina",  depth:8, hp:36, atk:14, glyph:"M", genes:["mcrA","hdrB","cdhA","ackA","fwdB","cooS","mnhA","recA","frhA","mtrH","acsB"], note:"The most metabolically flexible methanogen known." , pigment:"#dcc179" , facing:"none" , behaviour:"sessile", size:"large" , weapon:"packet" },
  // A methanotroph, which the column had no room for until pmoA existed:
  // it sits ABOVE the methanogens and eats what they make. Most of the
  // methane produced in sediment never reaches the water, and this is why.
  { id:"methylomonas",    name:"Methylomonas",    depth:7, hp:26, atk:10,  glyph:"m", genes:["pmoA","mmoX","katG","sodA","atpB","groL"], note:"Methanotroph. Oxidises the methane rising from below." , pigment:"#9fd8a8" , facing:"rotate" , behaviour:"chase", size:"medium" , weapon:"melee" },
  { id:"methanobacterium",name:"Methanobacterium",depth:8, hp:32, atk:13, glyph:"m", genes:["mcrA","fwdB","cdhA"],        note:"Hydrogenotrophic. CO2 + H2. The last respiration." , pigment:"#cdba8b" , facing:"rotate" , behaviour:"drift", size:"medium" , weapon:"melee" },
];

export interface Stratum {
  readonly depth: number; readonly name: string; readonly teap: Teap;
  readonly e0: number; readonly light: number;
  readonly wall: string; readonly floor: string; readonly accent: string;
  // Redundant, non-colour depth cue: wall fill pattern. Hue alone excludes
  // roughly 8% of men, and D1 and D6 are both green.
  readonly hatch: 0 | 1 | 2 | 3;
  readonly density: number; readonly passes: number; readonly blurb: string;
  /** The electron donor available here, and where it comes from. In a real
   *  column each layer runs on what its neighbours excrete: biomass sinks,
   *  sulfide rises. Acquiring the gene that uses this layer's donor is the
   *  whole of survival below the oxic zone. */
  readonly donor: string;
  readonly donorFrom: string;
}

export const STRATA: readonly Stratum[] = [
  { depth:1, name:"Oxic water column",  teap:"O2",      e0: 820, light:1.00, wall:"#6ec78d", floor:"#050d0a", accent:"#d8ffe8", hatch:0, density:0.5, passes:4, blurb:"Sunlit, oxygen-saturated. Everything here burns you slowly.", donor:"H2O", donorFrom:"photolysis" },
  { depth:2, name:"Sediment interface", teap:"NO3-",    e0: 430, light:0.70, wall:"#8cb86b", floor:"#0a0c06", accent:"#e6ffc9", hatch:1, density:0.53, passes:4, blurb:"Oxygen is running out. Nitrate takes over as acceptor.", donor:"organic C", donorFrom:"sinking biomass from D1" },
  { depth:3, name:"Suboxic Mn/S front", teap:"Mn(IV)",  e0: 400, light:0.42, wall:"#c7bd6e", floor:"#0d0b06", accent:"#fff4c2", hatch:1, density:0.55, passes:5, blurb:"The O2/H2S interface. Beggiatoa mats hold the boundary.", donor:"H2S", donorFrom:"sulfide rising from D7" },
  { depth:4, name:"Ferruginous zone",   teap:"Fe(III)", e0:   0, light:0.22, wall:"#c26b41", floor:"#0f0703", accent:"#ffcaa8", hatch:2, density:0.57, passes:5, blurb:"Rust. Fe(III) minerals respired by contact and by wire.", donor:"organic C", donorFrom:"sinking biomass" },
  { depth:5, name:"Purple sulfur band", teap:"S0",      e0:-120, light:0.12, wall:"#a4529c", floor:"#0c050c", accent:"#f0c2ec", hatch:2, density:0.58, passes:5, blurb:"Anoxygenic photosynthesis. Sulfide is the donor now.", donor:"H2S", donorFrom:"sulfide rising from D7" },
  { depth:6, name:"Green sulfur band",  teap:"H2S",     e0:-180, light:0.05, wall:"#4da767", floor:"#050b07", accent:"#c4f0d2", hatch:3, density:0.6, passes:6, blurb:"Almost no light reaches here. Chlorosomes catch what does.", donor:"H2S", donorFrom:"sulfide rising from D7" },
  { depth:7, name:"Sulfidogenic black", teap:"SO4",     e0:-220, light:0.01, wall:"#6b6875", floor:"#060608", accent:"#ccc8d8", hatch:3, density:0.61, passes:6, blurb:"FeS precipitate. Sulfide everywhere. The column's black floor.", donor:"H2 / acetate", donorFrom:"fermentation above" },
  { depth:8, name:"Methanogenic floor", teap:"CO2",     e0:-240, light:0.00, wall:"#8a7a52", floor:"#080602", accent:"#ffe9b0", hatch:3, density:0.63, passes:6, blurb:"The last acceptor. Nothing below is left to reduce.", donor:"H2", donorFrom:"fermentation above" },
];

export const MAX_DEPTH = STRATA.length;

const SURFACE: Stratum = STRATA[0] ?? {
  depth: 1, name: "Oxic water column", teap: "O2", e0: 820, light: 1,
  wall: "#6ec78d", floor: "#050d0a", accent: "#d8ffe8", hatch: 0,
  density: 0.38, passes: 4, blurb: "",
  donor: "H2O", donorFrom: "photolysis",
};

/** Total: any depth clamps into range rather than returning undefined. */
export const stratum = (d: number): Stratum =>
  STRATA[Math.min(Math.max(Math.floor(d), 1), MAX_DEPTH) - 1] ?? SURFACE;

export const microbesAt = (d: number): Microbe[] =>
  MICROBES.filter((m) => m.depth === d);

/** Energy multiplier: 1.0 at the oxic top, ~0.04 on the methanogenic floor. */
export function energyYield(depth: number): number {
  const lo = -240, hi = 820;
  return Math.max((stratum(depth).e0 - lo) / (hi - lo), 0.04);
}


// ---------------------------------------------------------------- complexes
//
// An operon is more than the sum of its genes. A pathway only works when every
// step is present, and a half-built pathway is worse than none at all because
// the intermediate accumulates. Both of those are real, and both are here.
//
// A complex requires its genes in ONE operon AND all of them expressing at the
// current depth, so a kit assembled for the sulfidic zone does nothing at the
// surface.

export type ComplexEffect =
  | { kind: "power"; mult: number }      // multiplies plasmid output
  | { kind: "regen"; hp: number }        // hp recovered per action
  | { kind: "reach"; tiles: number }     // attack range in tiles
  | { kind: "armour"; frac: number }     // incoming damage reduction
  | { kind: "aura"; dmg: number };       // damage to adjacent microbes per action

export interface Complex {
  readonly id: string;
  readonly name: string;
  readonly genes: readonly GeneId[];
  readonly effect: ComplexEffect;
  readonly note: string;
}

export const COMPLEXES: readonly Complex[] = [
  {
    id: "denitrification", name: "Complete denitrification",
    genes: ["narG", "nosZ"],
    effect: { kind: "power", mult: 1.35 },
    note: "NO3- reduced all the way to N2. Nothing accumulates, so the whole chain runs.",
  },
  {
    id: "autotrophy", name: "Oxygenic autotrophy",
    genes: ["psbA", "cbbL"],
    effect: { kind: "regen", hp: 1 },
    note: "Light plus RuBisCO is a closed loop: you fix your own carbon and repair.",
  },
  {
    id: "eet", name: "Extracellular electron transfer",
    genes: ["mtrC", "omcS"],
    effect: { kind: "reach", tiles: 2 },
    note: "MtrC dumps electrons by contact; OmcS nanowires carry them further. Strike at range.",
  },
  {
    id: "sulfidogenesis", name: "Dissimilatory sulfate reduction",
    genes: ["dsrA", "aprA"],
    effect: { kind: "aura", dmg: 2 },
    note: "Sulfate to sulfide. The H2S you exhale is toxic to everything adjacent.",
  },
  {
    id: "chlorosome", name: "Chlorosome antenna",
    genes: ["fmoA", "csmA"],
    effect: { kind: "power", mult: 1.5 },
    note: "FMO funnels excitons from a vast chlorosome. Photosynthesis at near-zero photon flux.",
  },
  {
    id: "methanogenesis", name: "Hydrogenotrophic methanogenesis",
    genes: ["mcrA", "hdrB"],
    effect: { kind: "power", mult: 1.6 },
    note: "Flavin-based electron bifurcation makes the last acceptor worth respiring.",
  },
  {
    id: "diazotrophy", name: "Nitrogenase with H2 recycling",
    genes: ["nifH", "hydA"],
    effect: { kind: "power", mult: 1.4 },
    note: "Nitrogenase obligately evolves H2; an uptake hydrogenase recovers it instead of venting.",
  },
  {
    id: "oxidative", name: "Oxidative and sulfide tolerance",
    genes: ["katG", "sqr"],
    effect: { kind: "armour", frac: 0.35 },
    note: "Catalase clears peroxide, SQR routes sulfide into the quinone pool. Both fronts covered.",
  },
  {
    id: "rtca", name: "Reverse TCA carbon fixation",
    genes: ["aclB", "pufM"],
    effect: { kind: "regen", hp: 1 },
    note: "Anoxygenic light plus rTCA. Cheaper per carbon than Calvin, and it runs without oxygen.",
  },
];

// A pathway missing its final step accumulates the intermediate. This is the
// classic case: nitrate reductase without N2O reductase leaves nitrous oxide.
export interface Hazard {
  readonly id: string;
  readonly name: string;
  readonly present: GeneId;
  readonly missing: GeneId;
  readonly dmg: number;
  readonly note: string;
}

export const HAZARDS: readonly Hazard[] = [
  {
    id: "n2o", name: "N2O accumulation",
    present: "narG", missing: "nosZ", dmg: 1,
    note: "Nitrate reduced to nitrous oxide with no N2O reductase to finish the job. It builds up.",
  },
  {
    id: "sulfite", name: "Sulfite accumulation",
    present: "aprA", missing: "dsrA", dmg: 1,
    note: "APS reductase makes sulfite faster than anything here consumes it. Sulfite is cytotoxic.",
  },
  {
    id: "peroxide", name: "Photo-oxidative damage",
    present: "psbA", missing: "katG", dmg: 1,
    note: "Photosystem II leaks reactive oxygen. Without catalase, you are the substrate.",
  },
];
