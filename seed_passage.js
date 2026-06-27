import Passage from "./src/models/PassageModel.js";
import Question from "./src/models/QuestionModel.js";
import Subject from "./src/models/SubjectModel.js";
import { connectMongoDB, disconnectMongoDB } from "./src/config/mongodb.js";

// ─── AUTHENTIC JAMB PAST QUESTION PASSAGES ────────────────────────────────────
const PASSAGES = [
  // ── JAMB 2019 English Comprehension ──────────────────────────────────────────
  {
    title: "JAMB 2019 – The Menace of Cultism",
    text: `Secret cults have been in existence in Nigerian universities and other tertiary institutions for a long time. Initially, they were formed to provide social welfare for the poor and oppressed students and to checkmate the excesses of the administration. The activities of these cults were originally carried out in secret and in a way that did not disrupt the peace of the campus.

However, things took a turn for the worse when these organisations came under the control of vicious and unscrupulous individuals. They became delinquent groups that terrorised and intimidated other students. Their activities were accompanied by violence, assault, rape, armed robbery, and even murder. Several factors have been identified as responsible for this ugly drift from noble ideals: peer influence, poverty, the desire for protection, the quest for power and recognition, parental neglect, and a lack of meaningful recreational and social activities.

The effects of cultism are devastating and far-reaching. Cult clashes have claimed numerous lives and led to the destruction of school property. Many brilliant students have had to drop out of school as a result of threats from cult members. Others have had their academic pursuits cut short by expulsion or imprisonment following involvement in cult-related activities. The psychological trauma suffered by victims of cult violence has long-lasting and debilitating consequences.

Various efforts have been made to curb the activities of secret cults in Nigerian schools. School authorities have resorted to mass expulsion of suspected cultists. Government has enacted legislation making cult membership a criminal offence punishable by law. Religious organisations and parents' bodies have intensified campaigns against the menace. Yet, these efforts have not succeeded in eradicating cultism. Experts argue that a more holistic approach is needed — one that addresses the root causes, including unemployment, poor governance, and the general breakdown of societal values. Only through such a comprehensive strategy can Nigerian educational institutions be freed from this terrible scourge.`,
    questions: [
      {
        text: "What was the original purpose for which secret cults were formed in Nigerian universities?",
        options: [
          { id: "A", text: "To engage in armed robbery and violence.", isCorrect: false },
          { id: "B", text: "To provide social welfare for poor students and check administrative excesses.", isCorrect: true },
          { id: "C", text: "To intimidate students and staff on campus.", isCorrect: false },
          { id: "D", text: "To promote political activities among students.", isCorrect: false },
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2019, questionCode: "JAMB-2019-ENG-C01" }
      },
      {
        text: "Secret cults became violent organisations when they came under the control of:",
        options: [
          { id: "A", text: "Poor and oppressed students.", isCorrect: false },
          { id: "B", text: "Religious and moral leaders.", isCorrect: false },
          { id: "C", text: "Vicious and unscrupulous individuals.", isCorrect: true },
          { id: "D", text: "Government-sponsored agents.", isCorrect: false },
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2019, questionCode: "JAMB-2019-ENG-C02" }
      },
      {
        text: "Which of the following is NOT identified in the passage as a factor responsible for the growth of cultism?",
        options: [
          { id: "A", text: "Peer influence.", isCorrect: false },
          { id: "B", text: "Parental neglect.", isCorrect: false },
          { id: "C", text: "Corrupt school administration.", isCorrect: true },
          { id: "D", text: "The desire for power and recognition.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2019, questionCode: "JAMB-2019-ENG-C03" }
      },
      {
        text: "The word 'debilitating' as used in the passage most nearly means:",
        options: [
          { id: "A", text: "Strengthening and empowering.", isCorrect: false },
          { id: "B", text: "Temporary and reversible.", isCorrect: false },
          { id: "C", text: "Weakening and incapacitating.", isCorrect: true },
          { id: "D", text: "Stimulating and exciting.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Vocabulary in Context", year: 2019, questionCode: "JAMB-2019-ENG-C04" }
      },
      {
        text: "According to the passage, why have the efforts to eradicate cultism not fully succeeded?",
        options: [
          { id: "A", text: "Because the government has refused to enact laws against cult membership.", isCorrect: false },
          { id: "B", text: "Because the efforts have not addressed the root causes of the problem.", isCorrect: true },
          { id: "C", text: "Because religious organisations have not been involved in the fight.", isCorrect: false },
          { id: "D", text: "Because students support cult activities on campus.", isCorrect: false },
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2019, questionCode: "JAMB-2019-ENG-C05" }
      }
    ]
  },

  // ── JAMB 2018 English Comprehension ──────────────────────────────────────────
  {
    title: "JAMB 2018 – The Problem of Corruption",
    text: `Corruption is one of the most serious problems facing Nigeria today. It has pervaded virtually every sector of national life — from the highest offices of government to the local market — and has become deeply embedded in the fabric of Nigerian society. The consequences of unchecked corruption are dire: public funds meant for roads, hospitals, and schools end up in private pockets, leaving citizens to contend with crumbling infrastructure, inadequate healthcare, and a dysfunctional educational system.

The roots of corruption in Nigeria are complex and intertwined. Some scholars trace it to the colonial era, arguing that the colonial state, by its very nature, modelled a system in which governance was synonymous with the extraction of resources for the benefit of a privileged few rather than the welfare of the many. Others point to the oil boom of the 1970s, which flooded the state with petrodollars and created a culture of easy money that severed the link between productivity and reward. Still others locate the problem in the crisis of values — a collapse of moral and ethical standards that has made personal gain acceptable even at the expense of the common good.

Efforts to fight corruption in Nigeria have yielded mixed results. The Economic and Financial Crimes Commission (EFCC) has secured numerous convictions and recovered billions of naira in stolen funds. However, critics argue that the anti-corruption war has been selective and politicised, used more as a weapon against political opponents than as a genuine crusade for clean governance. The slow pace of justice in the courts provides ample opportunity for cases to drag on for years, during which accused persons continue to enjoy their stolen wealth.

What is needed is a multi-pronged approach. The judiciary must be strengthened and insulated from executive interference. Whistleblower protections must be robust enough to encourage ordinary citizens to report corrupt practices without fear of reprisal. Civic education must begin in schools, instilling values of integrity and public service from an early age. Only when corruption is seen — and treated — as a genuine social evil, rather than a pragmatic survival strategy, can Nigeria hope to unlock its enormous potential.`,
    questions: [
      {
        text: "According to the passage, what is one major consequence of corruption in Nigeria?",
        options: [
          { id: "A", text: "Increased investment from foreign companies.", isCorrect: false },
          { id: "B", text: "Public funds are diverted to private use, leaving infrastructure in ruin.", isCorrect: true },
          { id: "C", text: "A reduction in the country's oil production capacity.", isCorrect: false },
          { id: "D", text: "The collapse of the country's armed forces.", isCorrect: false },
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2018, questionCode: "JAMB-2018-ENG-C01" }
      },
      {
        text: "Some scholars link the origins of corruption in Nigeria to the colonial era because:",
        options: [
          { id: "A", text: "Colonial rulers actively taught Nigerians to be corrupt.", isCorrect: false },
          { id: "B", text: "The colonial state modelled governance as resource extraction for a privileged few.", isCorrect: true },
          { id: "C", text: "Nigeria was the most corrupt country in Africa during colonialism.", isCorrect: false },
          { id: "D", text: "Colonial administrators embezzled all of Nigeria's oil revenue.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2018, questionCode: "JAMB-2018-ENG-C02" }
      },
      {
        text: "The criticism of the EFCC's anti-corruption war is that it has been:",
        options: [
          { id: "A", text: "Too aggressive and has imprisoned innocent people.", isCorrect: false },
          { id: "B", text: "Selective and politicised, targeting political opponents rather than genuine offenders.", isCorrect: true },
          { id: "C", text: "Underfunded and unable to prosecute any cases.", isCorrect: false },
          { id: "D", text: "Too focused on recovering stolen funds rather than jailing offenders.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2018, questionCode: "JAMB-2018-ENG-C03" }
      },
      {
        text: "As used in the passage, the word 'pervaded' most closely means:",
        options: [
          { id: "A", text: "Escaped from.", isCorrect: false },
          { id: "B", text: "Spread throughout.", isCorrect: true },
          { id: "C", text: "Been defeated by.", isCorrect: false },
          { id: "D", text: "Been ignored by.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Vocabulary in Context", year: 2018, questionCode: "JAMB-2018-ENG-C04" }
      },
      {
        text: "What does the writer suggest is the most fundamental step in fighting corruption?",
        options: [
          { id: "A", text: "Arresting and jailing all corrupt officials immediately.", isCorrect: false },
          { id: "B", text: "Changing the public perception of corruption from a survival strategy to a social evil.", isCorrect: true },
          { id: "C", text: "Abolishing the EFCC and replacing it with a new agency.", isCorrect: false },
          { id: "D", text: "Cutting off all relationships with former colonial powers.", isCorrect: false },
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2018, questionCode: "JAMB-2018-ENG-C05" }
      }
    ]
  },

  // ── JAMB 2017 English Comprehension ──────────────────────────────────────────
  {
    title: "JAMB 2017 – Drug Abuse Among Youths",
    text: `Drug abuse has become one of the most disturbing social problems confronting Nigerian society, particularly among the youth population. The Nigerian Drug Law Enforcement Agency (NDLEA) has reported an alarming rise in the abuse of both prescription drugs and illicit substances. From codeine-laced cough syrups to cannabis, tramadol, and harder narcotics, young Nigerians are increasingly falling victim to a crisis that carries severe personal, social, and economic consequences.

The causes of drug abuse among youths are varied and deeply rooted in social conditions. Peer pressure is perhaps the most immediate cause: young people are often introduced to drugs within their social circles and feel compelled to participate in order to gain acceptance. Family dysfunction — including broken homes, parental neglect, and domestic violence — creates emotional vulnerabilities that young people may attempt to numb through substance use. Unemployment and economic frustration play significant roles as well; without meaningful prospects for the future, some young people turn to drugs as an escape from the bleakness of their circumstances. The wide availability of cheap drugs, driven by criminal networks that deliberately target schools and universities, makes access dangerously easy.

The consequences of drug abuse are catastrophic. On the individual level, drug dependency destroys physical health, impairs cognitive function, and devastates personal relationships. Young addicts frequently drop out of school and become incapable of maintaining stable employment. Socially, drug abuse is strongly correlated with rising crime rates: many robberies, assaults, and violent crimes are committed by individuals under the influence or in search of funds to feed their addiction. The economic cost of treating drug-related illnesses and managing drug-related crime places an enormous burden on an already-strained public health system.

Combating drug abuse requires coordinated action on multiple fronts. The NDLEA must be adequately funded and its enforcement capacity strengthened. Schools and community organisations must implement evidence-based drug education programmes that go beyond simple scare tactics to provide young people with genuine life skills and coping mechanisms. Families must be supported through counselling services that address the underlying dysfunction that makes young people vulnerable in the first place. Above all, creating economic opportunities for the youth must be recognised as a core component of any credible drug abuse prevention strategy.`,
    questions: [
      {
        text: "According to the passage, which government agency has reported a rise in drug abuse in Nigeria?",
        options: [
          { id: "A", text: "The Economic and Financial Crimes Commission (EFCC).", isCorrect: false },
          { id: "B", text: "The Nigerian Drug Law Enforcement Agency (NDLEA).", isCorrect: true },
          { id: "C", text: "The National Agency for Food and Drug Administration and Control (NAFDAC).", isCorrect: false },
          { id: "D", text: "The Department of State Services (DSS).", isCorrect: false },
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2017, questionCode: "JAMB-2017-ENG-C01" }
      },
      {
        text: "Which of the following is cited in the passage as the most immediate cause of drug abuse among youths?",
        options: [
          { id: "A", text: "Unemployment and economic frustration.", isCorrect: false },
          { id: "B", text: "Family dysfunction and domestic violence.", isCorrect: false },
          { id: "C", text: "Peer pressure and the desire for social acceptance.", isCorrect: true },
          { id: "D", text: "The wide availability of cheap drugs near schools.", isCorrect: false },
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2017, questionCode: "JAMB-2017-ENG-C02" }
      },
      {
        text: "The word 'correlated' as used in the passage most nearly means:",
        options: [
          { id: "A", text: "Unrelated to.", isCorrect: false },
          { id: "B", text: "In opposition to.", isCorrect: false },
          { id: "C", text: "Having a mutual relationship with.", isCorrect: true },
          { id: "D", text: "Independent from.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Vocabulary in Context", year: 2017, questionCode: "JAMB-2017-ENG-C03" }
      },
      {
        text: "According to the passage, drug abuse education programmes in schools should:",
        options: [
          { id: "A", text: "Focus solely on frightening young people with graphic images.", isCorrect: false },
          { id: "B", text: "Provide life skills and genuine coping mechanisms beyond simple scare tactics.", isCorrect: true },
          { id: "C", text: "Be run exclusively by law enforcement agencies.", isCorrect: false },
          { id: "D", text: "Replace core academic subjects in the curriculum.", isCorrect: false },
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2017, questionCode: "JAMB-2017-ENG-C04" }
      },
      {
        text: "What does the writer identify as a 'core component' of any credible drug abuse prevention strategy?",
        options: [
          { id: "A", text: "Heavier prison sentences for drug dealers.", isCorrect: false },
          { id: "B", text: "Banning the sale of cough syrups containing codeine.", isCorrect: false },
          { id: "C", text: "Creating economic opportunities for the youth.", isCorrect: true },
          { id: "D", text: "Closing all tertiary institutions until the crisis is resolved.", isCorrect: false },
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2017, questionCode: "JAMB-2017-ENG-C05" }
      }
    ]
  },
  // ── JAMB 2020 English Comprehension ────────────────────────────────────────
  {
    title: "JAMB 2020 – Theatre in Africa",
    text: `Theatre in the recent past used to be a very popular art in traditional African society. It used to be a point of intersection where members of the community not only come to entertain themselves, but join heads together. In the traditional context of African drama, therefore, theatre was a popular and respectable institution which preserved the people's culture and tradition. Theatre was popular with the people because it emphasized community participation, peace and progress. The presentations focused on the people's lives, their aspirations, fears, and hopes. But today, the situation is different. Theatre is becoming very unpopular.

Africa of the present age is pre‑occupied with many problems yearning for immediate solutions. The continent is facing hydra‑head challenges – challenges on the political, social, and economic scenes. In a world where Science and Technology are seen as the solutions to these problems, little attention is paid to the arts. Literature generally, and drama in particular, is often rated very low on the utility‑scale. Many Africans today look at drama and theatre as a mere thing of fun, a joke so to say.

Elitism is another barrier that militates against the appreciation of theatre as a communal art. Folk theatre is appreciated by a negligible number of people; contemporary focus is on literary theatre. Unfortunately, literary theatre only pretends to serve the interest of its society while in reality, it has a foreign audience in mind. The use of European and American theatrical conventions by our academic playwrights can bear witness to this anomaly.

The popularity of the literary African theatre is further marred by the medium of communication as most literary dramas in Africa are written in foreign languages which are not understood by many Africans. The question often asked is whether the artist should climb down to the level of his community or stay at his exalted height and wait for the community to gradually move up to him.

- was traditional and simple in nature
- dealt with the political, social, and economic problems of the society
- was a source of fun
- was communal and reflected the common concerns of the people`,
    questions: [
      {
        text: "According to the passage, why was theatre historically popular in African societies?",
        options: [
          { id: "A", text: "Because it generated high revenue for artists.", isCorrect: false },
          { id: "B", text: "Because it served as a communal space preserving culture and fostering participation.", isCorrect: true },
          { id: "C", text: "Because it was solely performed in foreign languages.", isCorrect: false },
          { id: "D", text: "Because it focused only on entertainment without any social relevance.", isCorrect: false }
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2020, questionCode: "JAMB-2020-ENG-C01" }
      },
      {
        text: "Which factor does the author cite as a major reason for the decline of theatre today?",
        options: [
          { id: "A", text: "The rise of elitism and foreign-language productions.", isCorrect: true },
          { id: "B", text: "A lack of interest among the youth in any art forms.", isCorrect: false },
          { id: "C", text: "Government bans on theatrical performances.", isCorrect: false },
          { id: "D", text: "Insufficient funding for theatre infrastructure.", isCorrect: false }
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2020, questionCode: "JAMB-2020-ENG-C02" }
      },
      {
        text: "In the passage, the word ‘elitism’ most nearly means:",
        options: [
          { id: "A", text: "Widespread public support.", isCorrect: false },
          { id: "B", text: "A belief that only a privileged few should dominate cultural expression.", isCorrect: true },
          { id: "C", text: "An emphasis on rural traditions.", isCorrect: false },
          { id: "D", text: "A type of theatrical performance.", isCorrect: false }
        ],
        metadata: { difficulty: "medium", topic: "Vocabulary in Context", year: 2020, questionCode: "JAMB-2020-ENG-C03" }
      },
      {
        text: "Which statement best reflects the author’s tone towards modern African theatre?",
        options: [
          { id: "A", text: "Optimistic and encouraging.", isCorrect: false },
          { id: "B", text: "Critical of current neglect and loss of communal values.", isCorrect: true },
          { id: "C", text: "Indifferent and neutral.", isCorrect: false },
          { id: "D", text: "Celebratory of contemporary theatrical innovations.", isCorrect: false }
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2020, questionCode: "JAMB-2020-ENG-C04" }
      },
      {
        text: "According to the passage, what is a suggested solution to revive theatre in Africa?",
        options: [
          { id: "A", text: "Mandate performances only in foreign languages.", isCorrect: false },
          { id: "B", text: "Promote community‑based productions that use indigenous languages.", isCorrect: true },
          { id: "C", text: "Focus exclusively on literary theatre for elite audiences.", isCorrect: false },
          { id: "D", text: "Replace theatre with modern digital media platforms.", isCorrect: false }
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2020, questionCode: "JAMB-2020-ENG-C05" }
      }
    ]
  },

  // ── JAMB 2014 English Comprehension ────────────────────────────────────────
  {
    title: "JAMB 2014 – Snakes",
    text: `Like all reptiles, snakes are cold‑blooded, or more correctly, ectothermic – they cannot produce their own body heat; instead, they rely on the sun to heat their bodies. Because they do not rely on energy from food to generate body heat, snakes can survive on an extremely meager diet. Some wait for months between successive meals, and a few survive by eating a large meal just once or twice a year.

When they do eat, snakes swallow their prey whole rather than biting off small pieces. Many snakes have specialized jaws that enable them to swallow animals that are far larger than their own heads. Although uncommon, some snakes, such as the African rock python, have been observed eating animals as large as an antelope or a small cow. With over two thousand five hundred species belonging to more than ten families, snakes are a large and successful group. They owe much of this success to their versatility – snakes occupy habitat ranging from underground burrows to the top of the tree, to ocean depths as great as one hundred and fifty meters. They are found on every continent except Antarctica, and although they are most abundant in tropical areas, many survive in regions marked by extreme cold. The only places without snakes are parts of the polar regions and isolated islands, such as the Republic of Ireland and New‑Zealand...`,
    questions: [
      {
        text: "What does the term ‘ectothermic’ indicate about snakes?",
        options: [
          { id: "A", text: "They generate heat internally.", isCorrect: false },
          { id: "B", text: "They depend on external sources like the sun for body heat.", isCorrect: true },
          { id: "C", text: "They are warm‑blooded mammals.", isCorrect: false },
          { id: "D", text: "They can survive without any heat source.", isCorrect: false }
        ],
        metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2014, questionCode: "JAMB-2014-ENG-C01" }
      },
      {
        text: "According to the passage, why can some snakes survive for months without eating?",
        options: [
          { id: "A", text: "Because they store large amounts of fat in their tails.", isCorrect: false },
          { id: "B", text: "Because they do not need to generate body heat from food.", isCorrect: true },
          { id: "C", text: "Because they are able to photosynthesize.", isCorrect: false },
          { id: "D", text: "Because they feed on plants during that period.", isCorrect: false }
        ],
        metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2014, questionCode: "JAMB-2014-ENG-C02" }
      },
      {
        text: "The word ‘versatility’ as used in the passage most nearly means:",
        options: [
          { id: "A", text: "Inflexibility.", isCorrect: false },
          { id: "B", text: "Ability to adapt to many different environments.", isCorrect: true },
          { id: "C", text: "Aggressive predatory behavior.", isCorrect: false },
          { id: "D", text: "Slow reproductive rate.", isCorrect: false }
        ],
        metadata: { difficulty: "medium", topic: "Vocabulary in Context", year: 2014, questionCode: "JAMB-2014-ENG-C03" }
      },
      {
        text: "Which of the following statements is supported by the passage?",
        options: [
          { id: "A", text: "All snakes are found in tropical regions only.", isCorrect: false },
          { id: "B", text: "Snakes can be found on every continent except Antarctica.", isCorrect: true },
          { id: "C", text: "Snakes cannot survive in cold climates.", isCorrect: false },
          { id: "D", text: "Only African snakes can eat large prey like antelopes.", isCorrect: false }
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2014, questionCode: "JAMB-2014-ENG-C04" }
      },
      {
        text: "What does the author imply is a key factor behind the evolutionary success of snakes?",
        options: [
          { id: "A", text: "Their ability to photosynthesize.", isCorrect: false },
          { id: "B", text: "Their versatile habitat range and feeding adaptations.", isCorrect: true },
          { id: "C", text: "Their exclusive existence in tropical rainforests.", isCorrect: false },
          { id: "D", text: "Their bright coloration deterring predators.", isCorrect: false }
        ],
        metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2014, questionCode: "JAMB-2014-ENG-C05" }
      }
    ]
  },
    {
      title: "JAMB 2021 – Climate Change Impact",
      text: `Climate change has become one of the most pressing issues of the twenty‑first century. Rising global temperatures have led to erratic weather patterns, with prolonged droughts in some regions and severe flooding in others. In Africa, the Sahel zone has experienced a significant reduction in rainfall, jeopardising agricultural productivity and food security for millions of families. Coastal cities such as Lagos and Mombasa are facing increased sea‑level rise, threatening infrastructure and displacing communities.

      The effects of climate change are not uniform; some areas experience heightened temperatures that intensify the spread of vector‑borne diseases like malaria, while others see a shift in the habitats of wildlife, leading to biodiversity loss. Adaptation strategies are crucial. Governments are investing in renewable energy projects, promoting solar and wind farms to reduce reliance on fossil fuels. Additionally, reforestation efforts aim to restore carbon sinks and protect vulnerable ecosystems.

      Education plays a pivotal role in mitigating climate impacts. Schools are incorporating climate science into curricula, encouraging students to engage in community projects such as tree planting and water conservation. By empowering the younger generation with knowledge and practical skills, societies can foster a resilient response to the evolving climate challenge.`,
      questions: [
        {
          text: "According to the passage, which region in Africa is most affected by reduced rainfall?",
          options: [
            { id: "A", text: "The Sahara Desert", isCorrect: false },
            { id: "B", text: "The Sahel zone", isCorrect: true },
            { id: "C", text: "The Horn of Africa", isCorrect: false },
            { id: "D", text: "The Nile Delta", isCorrect: false }
          ],
          metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2021, questionCode: "JAMB-2021-ENG-C01" }
        },
        {
          text: "What is one of the health challenges mentioned as a consequence of rising temperatures?",
          options: [
            { id: "A", text: "Increased cases of malaria", isCorrect: true },
            { id: "B", text: "Higher incidence of diabetes", isCorrect: false },
            { id: "C", text: "More traffic accidents", isCorrect: false },
            { id: "D", text: "Rise in food allergies", isCorrect: false }
          ],
          metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2021, questionCode: "JAMB-2021-ENG-C02" }
        },
        {
          text: "Which adaptation measure is highlighted as a government initiative?",
          options: [
            { id: "A", text: "Construction of new highways", isCorrect: false },
            { id: "B", text: "Investment in renewable energy projects", isCorrect: true },
            { id: "C", text: "Expansion of oil drilling sites", isCorrect: false },
            { id: "D", text: "Introduction of new tax codes", isCorrect: false }
          ],
          metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2021, questionCode: "JAMB-2021-ENG-C03" }
        },
        {
          text: "What educational strategy is suggested to combat climate change?",
          options: [
            { id: "A", text: "Eliminating science subjects from the curriculum", isCorrect: false },
            { id: "B", text: "Integrating climate science into school curricula and encouraging community projects", isCorrect: true },
            { id: "C", text: "Focusing solely on mathematics exams", isCorrect: false },
            { id: "D", text: "Removing extracurricular activities to increase study time", isCorrect: false }
          ],
          metadata: { difficulty: "hard", topic: "Reading Comprehension", year: 2021, questionCode: "JAMB-2021-ENG-C04" }
        },
        {
          text: "Which of the following best describes the overall tone of the passage?",
          options: [
            { id: "A", text: "Pessimistic and discouraging", isCorrect: false },
            { id: "B", text: "Balanced, highlighting challenges and proactive solutions", isCorrect: true },
            { id: "C", text: "Indifferent and neutral", isCorrect: false },
            { id: "D", text: "Overly optimistic without acknowledging difficulties", isCorrect: false }
          ],
          metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2021, questionCode: "JAMB-2021-ENG-C05" }
        }
      ]
    },
    {
      title: "JAMB 2022 – Digital Learning in Africa",
      text: `The rapid expansion of internet connectivity across Africa has transformed the educational landscape. With the advent of affordable smartphones and the proliferation of mobile data plans, students in rural and urban areas alike now have unprecedented access to online resources. Digital platforms such as e‑learning portals, virtual classrooms, and massive open online courses (MOOCs) provide supplementary material that complements traditional classroom instruction.

      However, the digital divide remains a critical challenge. While urban centers enjoy reliable broadband connections, many remote communities struggle with intermittent service and high costs. To bridge this gap, governments and NGOs have launched initiatives that provide solar‑powered tablets and offline educational content warehouses, ensuring continuity of learning even in low‑connectivity zones.

      The integration of technology has also reshaped pedagogical approaches. Teachers are increasingly adopting blended learning models, combining face‑to‑face interaction with interactive multimedia. This shift encourages student engagement, critical thinking, and collaborative problem‑solving, preparing learners for the demands of a knowledge‑based economy.`,
      questions: [
        {
          text: "What primary benefit does increased internet connectivity bring to African students?",
          options: [
            { id: "A", text: "Higher salaries for teachers", isCorrect: false },
            { id: "B", text: "Access to online educational resources and e‑learning platforms", isCorrect: true },
            { id: "C", text: "More physical textbooks being printed", isCorrect: false },
            { id: "D", text: "Reduced school attendance", isCorrect: false }
          ],
          metadata: { difficulty: "easy", topic: "Reading Comprehension", year: 2022, questionCode: "JAMB-2022-ENG-C01" }
        },
        {
          text: "Which challenge is highlighted regarding digital learning in remote areas?",
          options: [
            { id: "A", text: "Excessive availability of high‑speed broadband", isCorrect: false },
            { id: "B", text: "Intermittent service and high data costs", isCorrect: true },
            { id: "C", text: "Too many tablets being distributed", isCorrect: false },
            { id: "D", text: "Overcrowded classrooms", isCorrect: false }
          ],
          metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2022, questionCode: "JAMB-2022-ENG-C02" }
        },
        {
          text: "What solution is mentioned to mitigate the digital divide?",
          options: [
            { id: "A", text: "Providing solar‑powered tablets and offline content warehouses", isCorrect: true },
            { id: "B", text: "Increasing tuition fees for online courses", isCorrect: false },
            { id: "C", text: "Eliminating all digital tools from schools", isCorrect: false },
            { id: "D", text: "Mandating only printed textbooks", isCorrect: false }
          ],
          metadata: { difficulty: "medium", topic: "Reading Comprehension", year: 2022, questionCode: "JAMB-2022-ENG-C03" }
        },
        {
          text: "How has teaching methodology changed according to the passage?",
          options: [
            { id: "A", text: "Teachers now rely exclusively on lecture‑only delivery", isCorrect: false },
            { id: "B", text: "Adoption of blended learning models that mix face‑to‑face and multimedia interaction", isCorrect: true },
            { id: "C", text: "Teachers have stopped using any technology in classrooms", isCorrect: false },
            { id: "D", text: "Students are no longer required to attend school in person", isCorrect: false }
          ],
          metadata: { difficulty: "hard", topic: "Reading Comprehension", year: 2022, questionCode: "JAMB-2022-ENG-C04" }
        },
        {
          text: "What overall perspective does the author adopt toward digital learning?",
          options: [
            { id: "A", text: "Skeptical, emphasizing only the drawbacks", isCorrect: false },
            { id: "B", text: "Optimistic, acknowledging challenges while highlighting proactive solutions", isCorrect: true },
            { id: "C", text: "Neutral, presenting facts without any evaluative tone", isCorrect: false },
            { id: "D", text: "Critical, suggesting abandonment of digital tools", isCorrect: false }
          ],
          metadata: { difficulty: "hard", topic: "Inference and Tone", year: 2022, questionCode: "JAMB-2022-ENG-C05" }
        }
      ]
    },,
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function seedAllPassages() {
  try {
    await connectMongoDB();
    console.log("");

    const englishSubject = await Subject.findOne({ name: { $regex: /english/i } });
    if (!englishSubject) {
      console.error("❌ Could not find an 'English' subject in the database.");
      process.exit(1);
    }
    console.log(`📚 English subject found: ${englishSubject._id} (${englishSubject.name})`);

    let totalPassages = 0;
    let totalQuestions = 0;

    for (const entry of PASSAGES) {
      console.log(`\n── Seeding: "${entry.title}"`);

      // Check if passage already exists by title
      let newPassage = await Passage.findOne({ title: entry.title });
      if (newPassage) {
        console.log(`   ⚠️ Passage already exists: ${newPassage._id}, skipping creation.`);
      } else {
        newPassage = await Passage.create({
          subjectId: englishSubject._id,
          title: entry.title,
          text: entry.text,
        });
        console.log(`   ✅ Passage created: ${newPassage._id} (${entry.text.length} chars)`);
        totalPassages++;
      }

      // Prepare questions – only insert those not already present
      const questionsToInsert = [];
      for (const q of entry.questions) {
        const exists = await Question.findOne({ "metadata.questionCode": q.metadata.questionCode });
        if (exists) {
          console.log(`   ⚠️ Question ${q.metadata.questionCode} already exists, skipping.`);
        } else {
          questionsToInsert.push({
            subjectId: englishSubject._id,
            passageId: newPassage._id,
            passageText: entry.text,
            content: { text: q.text },
            options: q.options,
            metadata: q.metadata,
          });
        }
      }

      if (questionsToInsert.length) {
        const inserted = await Question.insertMany(questionsToInsert);
        console.log(`   ✅ ${inserted.length} new questions inserted.`);
        totalQuestions += inserted.length;
      } else {
        console.log('   ✅ No new questions to insert for this passage.');
      }
    }

    // Rebuild Redis pool so new questions are immediately available
    try {
      const { default: QuestionPoolService } = await import("./src/services/QuestionPoolService.js");
      await QuestionPoolService.rebuildSubjectPool(englishSubject._id);
      console.log("\n✅ Redis pool rebuilt for English subject.");
    } catch (err) {
      console.warn("⚠️  Could not rebuild Redis pool (non-fatal):", err.message);
    }

    console.log(`\n🎉 Done! Seeded ${totalPassages} JAMB passages and ${totalQuestions} questions total.`);
    await disconnectMongoDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding:", error.message);
    await disconnectMongoDB();
    process.exit(1);
  }
}

seedAllPassages();
