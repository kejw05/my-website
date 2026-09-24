import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type Language = 'en' | 'cs';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.about': 'About',
    'nav.projects': 'Projects',
    'nav.travels': 'Travels',
    'nav.contact': 'Contact',

    // Hero section
    'hero.greeting': 'Hi, I\'m',
    'hero.name': 'Jakub Drobník',
    'hero.title': 'Software Engineer @ Apify',
    'hero.description': 'Building web scraping tools, integrations, and developer platforms. Passionate about clean code, open source, and exploring the world with a drone.',
    'hero.cta': 'See my travels →',

    // About section
    'about.title': 'About',
    'about.p1.before': 'I\'m a software engineer at ',
    'about.p1.after': ', where I work on integrations, platform features, and developer tooling. I enjoy building things that make developers\' lives easier.',
    'about.p2': 'When I\'m not coding, you\'ll find me traveling with my drone, capturing aerial perspectives of the places I visit. I\'ve been to 13 regions across 4 continents — from the glaciers of Iceland to the rainforests of Costa Rica.',

    // Projects section
    'projects.title': 'Projects',
    'projects.apify.name': 'Apify',
    'projects.apify.description': 'Web scraping and automation platform. Building tools that help businesses extract data from the web at scale.',
    'projects.realitni-pes.name': 'Realitní pes',
    'projects.realitni-pes.description': 'Czech real estate watchdog. Monitors property listings and notifies users about new offers matching their criteria.',

    // Travels teaser
    'travels-teaser.emoji': '🌍',
    'travels-teaser.title': 'I also travel with a drone',
    'travels-teaser.description': '13 destinations, 4 continents, 70 drone photos. Check out my interactive travel map.',
    'travels-teaser.cta': 'Explore my travels →',

    // Contact section
    'contact.title': 'Contact',

    // Footer
    'footer.text': 'Built with React + TypeScript.',

    // Travels page
    'travels.hero.title.part1': 'The world from',
    'travels.hero.title.part2': 'above',
    'travels.hero.subtitle': 'Exploring the world with a drone — one flight at a time. Here are the places I\'ve captured from the sky.',
    'travels.stats.destinations': 'Destinations',
    'travels.stats.continents': 'Continents',
    'travels.stats.photos': 'Drone Photos',
    'travels.stats.memories': 'Memories',
    'travels.destinations-title': '🗺️ Destinations',
    'travels.year-filter.all': 'All',
    'travels.card.view': 'View gallery →',
    'travels.card.photos': 'photos',
    'travels.loading': 'Loading…',
    'travels.loading-map': 'Loading map…',
    'travels.loading-destinations': 'Loading destinations…',
    'travels.error.title': 'Failed to load destinations',

    // Travel places
    'travel.iceland.name': 'Iceland',
    'travel.iceland.description': 'Land of fire and ice — volcanic landscapes, glaciers, waterfalls, and endless horizons from the drone.',
    'travel.canadian-rockies.name': 'Canadian Rockies',
    'travel.canadian-rockies.description': 'Turquoise lakes, towering peaks, and pristine wilderness across British Columbia and Alberta.',
    'travel.malaysia.name': 'Malaysia',
    'travel.malaysia.description': 'Tropical beaches, Kuala Lumpur skyline, and lush jungles of Southeast Asia.',
    'travel.bali.name': 'Bali',
    'travel.bali.description': 'Rice terraces, temple ceremonies, dramatic cliffs, and endless sunsets over the Indian Ocean.',
    'travel.yosemite.name': 'Yosemite',
    'travel.yosemite.description': 'Granite cliffs, giant sequoias, and the breathtaking valley views of California\'s crown jewel.',
    'travel.silicon-valley.name': 'Silicon Valley',
    'travel.silicon-valley.description': 'The tech capital of the world — aerial views over San Jose and the Bay Area.',
    'travel.mexican-caribbean.name': 'Mexican Caribbean',
    'travel.mexican-caribbean.description': 'Turquoise waters, ancient Mayan ruins, cenotes, and white sand beaches along the Riviera Maya.',
    'travel.yucatan.name': 'Yucatán',
    'travel.yucatan.description': 'Pink flamingo lagoons, Mayan pyramids, and colorful colonial towns deep in the Mexican interior.',
    'travel.guatemala.name': 'Guatemala',
    'travel.guatemala.description': 'Volcanoes, misty highlands, Lake Atitlán, and the ancient ruins of Tikal from above.',
    'travel.ecuador.name': 'Ecuador',
    'travel.ecuador.description': 'The equator line, Andean highlands, cloud forests, and the diversity of a tiny, mighty country.',
    'travel.colombia.name': 'Colombia',
    'travel.colombia.description': 'Caribbean coastline, colonial Cartagena, lush coffee country, and vibrant cities from the sky.',
    'travel.costa-rica.name': 'Costa Rica',
    'travel.costa-rica.description': 'Pura vida — rainforests, volcanoes, wild coastlines, and incredible biodiversity.',
    'travel.panama.name': 'Panama',
    'travel.panama.description': 'Where two oceans meet — tropical islands, misty highlands, and the famous canal from above.',

    // Continents
    'continent.Europe': 'Europe',
    'continent.North America': 'North America',
    'continent.South America': 'South America',
    'continent.Asia': 'Asia',
  },
  cs: {
    // Navigation
    'nav.about': 'O mně',
    'nav.projects': 'Projekty',
    'nav.travels': 'Cestování',
    'nav.contact': 'Kontakt',

    // Hero section
    'hero.greeting': 'Ahoj, jsem',
    'hero.name': 'Jakub Drobník',
    'hero.title': 'Software Engineer @ Apify',
    'hero.description': 'Vytvářím nástroje pro web scraping, integrace a vývojářské platformy. Baví mě čistý kód, open source a objevování světa s dronem.',
    'hero.cta': 'Podívej se na moje cesty →',

    // About section
    'about.title': 'O mně',
    'about.p1.before': 'Jsem software engineer v ',
    'about.p1.after': ', kde pracuji na integracích, funkcích platformy a vývojářských nástrojích. Baví mě vytvářet věci, které usnadňují život vývojářům.',
    'about.p2': 'Když zrovna neprogramuji, najdeš mě na cestách s dronem, jak zachycuji letecké pohledy na místa, která navštívím. Byl jsem ve 13 regionech na 4 kontinentech — od islandských ledovců po kostarické deštné pralesy.',

    // Projects section
    'projects.title': 'Projekty',
    'projects.apify.name': 'Apify',
    'projects.apify.description': 'Platforma pro web scraping a automatizaci. Vytvářím nástroje, které pomáhají firmám získávat data z webu ve velkém měřítku.',
    'projects.realitni-pes.name': 'Realitní pes',
    'projects.realitni-pes.description': 'Český watchdog pro nemovitosti. Sleduje inzeráty a upozorňuje uživatele na nové nabídky odpovídající jejich kritériím.',

    // Travels teaser
    'travels-teaser.emoji': '🌍',
    'travels-teaser.title': 'Taky cestuji s dronem',
    'travels-teaser.description': '13 destinací, 4 kontinenty, 70 fotek z dronu. Podívej se na moji interaktivní mapu cest.',
    'travels-teaser.cta': 'Prozkoumat moje cesty →',

    // Contact section
    'contact.title': 'Kontakt',

    // Footer
    'footer.text': 'Postaveno s React + TypeScript.',

    // Travels page
    'travels.hero.title.part1': 'Svět z',
    'travels.hero.title.part2': 'nebe',
    'travels.hero.subtitle': 'Objevuji svět s dronem — jeden let po druhém. Tady jsou místa, která jsem zachytil z nebe.',
    'travels.stats.destinations': 'Destinace',
    'travels.stats.continents': 'Kontinenty',
    'travels.stats.photos': 'Fotek z dronu',
    'travels.stats.memories': 'Vzpomínky',
    'travels.destinations-title': '🗺️ Destinace',
    'travels.year-filter.all': 'Vše',
    'travels.card.view': 'Zobrazit galerii →',
    'travels.card.photos': 'fotek',
    'travels.loading': 'Načítání…',
    'travels.loading-map': 'Načítání mapy…',
    'travels.loading-destinations': 'Načítání destinací…',
    'travels.error.title': 'Nepodařilo se načíst destinace',

    // Travel places
    'travel.iceland.name': 'Island',
    'travel.iceland.description': 'Země ohně a ledu — sopečné krajiny, ledovce, vodopády a nekonečné obzory z dronu.',
    'travel.canadian-rockies.name': 'Kanadské Skalnaté hory',
    'travel.canadian-rockies.description': 'Tyrkysová jezera, mohutné vrcholy a nedotčená divočina v Britské Kolumbii a Albertě.',
    'travel.malaysia.name': 'Malajsie',
    'travel.malaysia.description': 'Tropické pláže, panorama Kuala Lumpur a bujné džungle jihovýchodní Asie.',
    'travel.bali.name': 'Bali',
    'travel.bali.description': 'Rýžové terasy, chrámové obřady, dramatické útesy a nekonečné západy slunce nad Indickým oceánem.',
    'travel.yosemite.name': 'Yosemite',
    'travel.yosemite.description': 'Žulové útesy, obří sekvoje a dechberoucí výhledy na údolí kalifornského klenotu.',
    'travel.silicon-valley.name': 'Silicon Valley',
    'travel.silicon-valley.description': 'Technologická hlavní město světa — letecké pohledy na San Jose a Bay Area.',
    'travel.mexican-caribbean.name': 'Mexický Karibik',
    'travel.mexican-caribbean.description': 'Tyrkysové vody, starověké mayské ruiny, cenoty a bílé písečné pláže podél Riviéry Maya.',
    'travel.yucatan.name': 'Yucatán',
    'travel.yucatan.description': 'Růžové lagunové plameniáky, mayské pyramidy a barevná koloniální města hluboko v mexickém vnitrozemí.',
    'travel.guatemala.name': 'Guatemala',
    'travel.guatemala.description': 'Sopky, mlhavé vysočiny, jezero Atitlán a starověké ruiny Tikalu z nebe.',
    'travel.ecuador.name': 'Ekvádor',
    'travel.ecuador.description': 'Linie rovníku, andská vysočina, oblačné lesy a rozmanitost malinké, ale mocné země.',
    'travel.colombia.name': 'Kolumbie',
    'travel.colombia.description': 'Karibské pobřeží, koloniální Cartagena, bujná kávová krajina a živá města z nebe.',
    'travel.costa-rica.name': 'Kostarika',
    'travel.costa-rica.description': 'Pura vida — deštné pralesy, sopky, divoké pobřeží a neuvěřitelná biodiverzita.',
    'travel.panama.name': 'Panama',
    'travel.panama.description': 'Kde se setkávají dva oceány — tropické ostrovy, mlhavé vysočiny a slavný průplav z nebe.',

    // Continents
    'continent.Europe': 'Evropa',
    'continent.North America': 'Severní Amerika',
    'continent.South America': 'Jižní Amerika',
    'continent.Asia': 'Asie',
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'en' || saved === 'cs') ? saved : 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const t = useCallback((key: string): string => {
    return translations[language][key] || key;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
