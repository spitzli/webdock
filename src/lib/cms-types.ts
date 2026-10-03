// Public content contract with the central Webdock CMS. No auth or database types.
export interface LandingContent {
  id: number;
  seoTitle: string;
  seoDescription: string;
  contactEmail: string;
  heroTitle: string;
  heroDescription: string;
  heroButton: string;
  heroNote: string;
  conceptTitle: string;
  conceptDescription: string;
  useCases: {
    title: string;
    description: string;
    id?: string | null;
  }[];
  aboutTitle: string;
  aboutDescription: string;
  faqTitle: string;
  faqs: {
    question: string;
    answer: string;
    id?: string | null;
  }[];
  outlookTitle: string;
  outlookDescription: string;
  closingTitle: string;
  closingButton: string;
  updatedAt?: string | null;
  createdAt?: string | null;
}
