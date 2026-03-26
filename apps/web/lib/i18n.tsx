"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type Locale = "en" | "fr";

const LOCALE_STORAGE_KEY = "event-platform.locale";
const LOCALE_COOKIE_KEY = "event-platform-locale";
const DEFAULT_LOCALE: Locale = "en";

const FR_MESSAGES: Record<string, string> = {
  Admin: "Admin",
  Administration: "Administration",
  "Admin Overview": "Vue d'ensemble admin",
  "Admin Panel": "Panneau admin",
  Overview: "Vue d'ensemble",
  Dashboard: "Tableau de bord",
  Portal: "Portail",
  Staff: "Staff",
  Event: "Événement",
  Events: "Événements",
  "All Events": "Tous les événements",
  "Event Management": "Gestion de l'événement",
  Configuration: "Configuration",
  Applications: "Candidatures",
  Reviews: "Évaluations",
  Messages: "Messages",
  Metrics: "Metriques",
  "Check-in": "Enregistrement",
  Workflow: "Flux de travail",
  Forms: "Formulaires",
  Microsite: "Microsite",
  "People & Stats": "Personnes et statistiques",
  "Roles & Users": "Rôles et utilisateurs",
  Announcements: "Annonces",
  "Audit Log": "Journal d'audit",
  Settings: "Paramètres",
  Profile: "Profil",
  Inbox: "Boîte de réception",
  "My Events": "Mes événements",
  "Staff Dashboard": "Tableau staff",
  "Back to Staff Dashboard": "Retour au tableau staff",
  User: "Utilisateur",
  "Log out": "Déconnexion",
  Language: "Langue",
  "Switch language": "Changer la langue",
  English: "Anglais",
  French: "Français",
  "Email verification required": "Vérification de l'e-mail requise",
  "You can continue using your account, but you still need to verify your email address.":
    "Vous pouvez continuer à utiliser votre compte, mais vous devez encore vérifier votre adresse e-mail.",
  "Send verification email": "Envoyer l'e-mail de vérification",
  "Remind me later": "Me le rappeler plus tard",
  "Please wait and try again.": "Veuillez patienter et réessayer.",
  "Verification email sent.": "E-mail de vérification envoyé.",
  "My Applications": "Mes candidatures",
  "Track your event applications and next steps":
    "Suivez vos candidatures et les prochaines étapes",
  "Unread messages": "Messages non lus",
  Accepted: "Accepté",
  "Upcoming Deadlines": "Échéances à venir",
  Overdue: "En retard",
  "Due today": "À rendre aujourd'hui",
  All: "Tous",
  "In Progress": "En cours",
  Waitlisted: "Liste d'attente",
  Rejected: "Refusé",
  "Latest first": "Plus récents d'abord",
  Deadline: "Échéance",
  "Event name": "Nom de l'événement",
  "No applications yet": "Aucune candidature pour le moment",
  "Browse events and submit your first application to get started.":
    "Parcourez les événements et envoyez votre première candidature pour commencer.",
  "No matching applications": "Aucune candidature correspondante",
  "Try changing the filter to see more applications.":
    "Essayez de changer le filtre pour voir plus de candidatures.",
  Progress: "Progression",
  "View website": "Voir le site",
  Continue: "Continuer",
  View: "Voir",
  "Platform-wide metrics and recent activity":
    "Indicateurs globaux de la plateforme et activité récente",
  "Create Event": "Créer un événement",
  "Manage Roles": "Gérer les rôles",
  "Recent Events": "Événements récents",
  "View all": "Voir tout",
  "Total Events": "Total des événements",
  "Active Events": "Événements actifs",
  "Total Users": "Total des utilisateurs",
  "Total Applications": "Total des candidatures",
  "Started Applications": "Candidatures démarrées",
  "Staff Users": "Utilisateurs staff",
  "Role Assignments": "Attributions de rôles",
  Published: "Publié",
  Draft: "Brouillon",
  Created: "Créé",
  "Choose an event workspace to manage applications, reviews, messaging, and check-in.":
    "Choisissez un espace événement pour gérer les candidatures, les évaluations, les messages et l'enregistrement.",
  "Assigned events": "Événements assignés",
  "Organizer events": "Événements organisateur",
  "Role assignments": "Attributions de rôles",
  "Search events by name, slug, or role...":
    "Rechercher des événements par nom, slug ou rôle...",
  "No assigned events": "Aucun événement assigné",
  "No matching events": "Aucun événement correspondant",
  "You do not have any staff or organizer assignments yet.":
    "Vous n'avez encore aucune attribution staff ou organisateur.",
  "Try a different search term.": "Essayez un autre terme de recherche.",
  "Open workspace": "Ouvrir l'espace",
  "No events found": "Aucun événement trouvé",
  "No events are available at the moment. Check back soon!":
    "Aucun événement n'est disponible pour le moment. Revenez bientôt !",
  "No direct messages": "Aucun message direct",
  "No messages yet": "Aucun message pour le moment",
  "No message body available.": "Aucun contenu de message disponible.",
  "Could not load full message.":
    "Impossible de charger le message complet.",
  "Messages from events you apply to will appear here.":
    "Les messages des événements auxquels vous candidatez apparaîtront ici.",
  "You have no unread messages.": "Vous n'avez aucun message non lu.",
  "System Announcements": "Annonces système",
  "Save changes": "Enregistrer les modifications",
  Save: "Enregistrer",
  Cancel: "Annuler",
  Delete: "Supprimer",
  Edit: "Modifier",
  Search: "Rechercher",
  "View details": "Voir les détails",
  Open: "Ouvrir",
  "No changes to save.": "Aucune modification à enregistrer.",
  "Loading user information...":
    "Chargement des informations utilisateur...",
  "User not found.": "Utilisateur introuvable.",
  "Back to People": "Retour aux personnes",
  Warning: "Avertissement",
  "Account Summary": "Résumé du compte",
  "Account & Profile": "Compte et profil",
  "Set Password": "Définir le mot de passe",
  "Staff Role Assignments": "Attributions de rôles staff",
  Active: "Actif",
  Inactive: "Inactif",
  Disabled: "Désactivé",
  Enabled: "Activé",
  Verified: "Vérifié",
  Unverified: "Non vérifié",
  "Global Admin": "Admin global",
  "Checked In": "Enregistré",
  Submitted: "Soumis",
  Approved: "Approuvé",
  Confirmed: "Confirmé",
  Closed: "Fermé",
  Locked: "Verrouillé",
  Archived: "Archivé",
  "Needs Revision": "Révision requise",
  "In Review": "En évaluation",
  "Revision Required": "Révision requise",
  None: "Aucun",
  "Invalid credentials": "Identifiants invalides",
  "Signup failed": "Échec de l'inscription",
  "Network error. Please try again.":
    "Erreur réseau. Veuillez réessayer.",
  "Invalid or missing reset token.":
    "Jeton de réinitialisation invalide ou manquant.",
  "Password reset successfully!": "Mot de passe réinitialisé avec succès !",
  "Unlocking the scientific potential of Moroccan youth":
    "Libérer le potentiel scientifique de la jeunesse marocaine",
  "Apply to competitions, training camps, and academic programs. Track your applications and connect with the community.":
    "Postulez à des compétitions, des camps de formation et des programmes académiques. Suivez vos candidatures et rejoignez la communauté.",
  "Discover Events": "Découvrir les événements",
  "Apply Seamlessly": "Postuler facilement",
  "Track Everything": "Tout suivre",
  "Collaborative Reviews": "Évaluations collaboratives",
  "Custom Workflows": "Workflows personnalisés",
  "Beautiful Microsites": "Microsites élégants",
  "Browse competitions, camps, and programs. Filter by date, location, and format to find your perfect match.":
    "Parcourez des compétitions, des camps et des programmes. Filtrez par date, lieu et format pour trouver ce qui vous convient.",
  "Multi-step application forms with auto-save drafts. Upload documents, track progress, and submit with confidence.":
    "Formulaires de candidature multi-étapes avec brouillons auto-enregistrés. Téléversez des documents, suivez la progression et envoyez en confiance.",
  "Real-time status updates on every application. View decisions, revision requests, and deadlines in one dashboard.":
    "Mises à jour en temps réel de chaque candidature. Consultez décisions, demandes de révision et échéances dans un seul tableau.",
  "Organizers assign reviewers, set rubrics, and collect structured feedback. Fair and transparent evaluations.":
    "Les organisateurs assignent des évaluateurs, définissent des grilles et collectent des retours structurés. Des évaluations justes et transparentes.",
  "Multi-stage workflows with forms, reviews, and approval gates. Fully configurable to match any process.":
    "Workflows multi-étapes avec formulaires, évaluations et validations. Entièrement configurables pour tout processus.",
  "Build event landing pages with a drag-and-drop block editor. Publish instantly with custom domains.":
    "Créez des pages d'événement avec un éditeur de blocs glisser-déposer. Publiez instantanément avec des domaines personnalisés.",
  Browse: "Explorer",
  Apply: "Postuler",
  Track: "Suivre",
  "Explore open events and find opportunities that match your interests.":
    "Explorez les événements ouverts et trouvez des opportunités adaptées à vos intérêts.",
  "Complete application forms at your own pace with auto-saved drafts.":
    "Complétez les formulaires de candidature à votre rythme avec des brouillons auto-enregistrés.",
  "Monitor your application status and respond to revision requests instantly.":
    "Suivez l'état de votre candidature et répondez instantanément aux demandes de révision.",
  "Browse Events": "Parcourir les événements",
  "Sign in": "Se connecter",
  "Get started": "Commencer",
  "The platform for math competitions in Morocco":
    "La plateforme des compétitions de mathématiques au Maroc",
  "Your gateway to mathematical excellence":
    "Votre passerelle vers l'excellence mathématique",
  "Discover competitions, apply to programs, and track your journey. The complete platform for students, organizers, and reviewers.":
    "Découvrez des compétitions, postulez à des programmes et suivez votre parcours. La plateforme complète pour étudiants, organisateurs et évaluateurs.",
  "Create an account": "Créer un compte",
  "Everything you need": "Tout ce dont vous avez besoin",
  "A complete platform for managing events, applications, and reviews — from start to finish.":
    "Une plateforme complète pour gérer événements, candidatures et évaluations du début à la fin.",
  "A complete platform for managing events, applications, and reviews â€” from start to finish.":
    "Une plateforme complète pour gérer événements, candidatures et évaluations du début à la fin.",
  "How it works": "Comment ça marche",
  "Get started in three simple steps.":
    "Commencez en trois étapes simples.",
  "Ready to get started?": "Prêt à commencer ?",
  "Join students and organizers across Morocco. Create your account today and discover upcoming events.":
    "Rejoignez des étudiants et organisateurs partout au Maroc. Créez votre compte aujourd'hui et découvrez les prochains événements.",
  "Sign up": "S'inscrire",
  "Page not found": "Page introuvable",
  "The page you are looking for does not exist or may have been moved. You can go back home or browse currently available events.":
    "La page que vous recherchez n'existe pas ou a été déplacée. Vous pouvez revenir à l'accueil ou parcourir les événements disponibles.",
  "Go to home": "Aller à l'accueil",
  "Back to platform": "Retour à la plateforme",
  "Browse events": "Parcourir les événements",
  "Error 404": "Erreur 404",
  "Welcome back": "Bon retour",
  "Sign in to your Math&Maroc account":
    "Connectez-vous à votre compte Math&Maroc",
  Email: "E-mail",
  Password: "Mot de passe",
  "Forgot password?": "Mot de passe oublié ?",
  "Don't have an account?": "Vous n'avez pas de compte ?",
  "Enter a valid email": "Saisissez un e-mail valide",
  "Password is required": "Le mot de passe est requis",
  "Sign up to start applying to events":
    "Inscrivez-vous pour commencer à postuler aux événements",
  "Registration Closed": "Inscriptions fermées",
  "New member registration is currently disabled by the administrators. Please check back later.":
    "L'inscription des nouveaux membres est actuellement désactivée par les administrateurs. Veuillez réessayer plus tard.",
  "Back to sign in": "Retour à la connexion",
  "Check your email": "Vérifiez votre e-mail",
  "Account created": "Compte créé",
  "We've sent a verification link to your email address. Please check your inbox and click the link to activate your account.":
    "Nous avons envoyé un lien de vérification à votre adresse e-mail. Vérifiez votre boîte de réception et cliquez sur le lien pour activer votre compte.",
  "Your account is ready. You can sign in and start your application now.":
    "Votre compte est prêt. Vous pouvez vous connecter et commencer votre candidature.",
  "Password must be at least 8 characters":
    "Le mot de passe doit comporter au moins 8 caractères",
  "Passwords don't match": "Les mots de passe ne correspondent pas",
  "Min. 8 characters": "Min. 8 caractères",
  "Confirm password": "Confirmer le mot de passe",
  "Repeat your password": "Répétez votre mot de passe",
  "Create account": "Créer un compte",
  "Already have an account?": "Vous avez déjà un compte ?",
  "Enter your email and we'll send you a reset link":
    "Saisissez votre e-mail et nous vous enverrons un lien de réinitialisation",
  "Send reset link": "Envoyer le lien de réinitialisation",
  "Remember your password?": "Vous vous souvenez de votre mot de passe ?",
  "Invalid link": "Lien invalide",
  "This password reset link is invalid or has expired.":
    "Ce lien de réinitialisation est invalide ou a expiré.",
  "Request a new link": "Demander un nouveau lien",
  "Reset password": "Réinitialiser le mot de passe",
  "Enter your new password below":
    "Saisissez votre nouveau mot de passe ci-dessous",
  "New password": "Nouveau mot de passe",
  "Repeat password": "Répéter le mot de passe",
  "Verifying your email...": "Vérification de votre e-mail...",
  "Email verified!": "E-mail vérifié !",
  "Your email has been verified. You can now sign in to your account.":
    "Votre e-mail a été vérifié. Vous pouvez maintenant vous connecter à votre compte.",
  "Verification failed": "Échec de la vérification",
  "This verification link is invalid or has expired.":
    "Ce lien de vérification est invalide ou a expiré.",
};

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}

function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = values[key];
    return value == null ? `{${key}}` : String(value);
  });
}

function readLocaleFromCookie(cookie: string): Locale | null {
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_KEY}=([^;]+)`),
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isLocale(value) ? value : null;
}

function translateDynamicFrench(text: string): string {
  const daysLeftMatch = text.match(/^(\d+)d left$/);
  if (daysLeftMatch) {
    return `${daysLeftMatch[1]} j restants`;
  }

  const applicationsMatch = text.match(/^(\d+)\s+applications$/);
  if (applicationsMatch) {
    return `${applicationsMatch[1]} candidatures`;
  }

  const issuedMatch = text.match(/^Issued (.+)$/);
  if (issuedMatch) {
    return `Délivré le ${issuedMatch[1]}`;
  }

  const dueMatch = text.match(/^Due (.+)$/);
  if (dueMatch) {
    return `Échéance ${dueMatch[1]}`;
  }

  const submittedMatch = text.match(/^Submitted (.+)$/);
  if (submittedMatch) {
    return `Soumis le ${submittedMatch[1]}`;
  }

  const updatedMatch = text.match(/^Updated (.+)$/);
  if (updatedMatch) {
    return `Mis à jour le ${updatedMatch[1]}`;
  }

  const createdMatch = text.match(/^Created (.+)$/);
  if (createdMatch) {
    return `Créé le ${createdMatch[1]}`;
  }

  const checkedInMatch = text.match(/^Checked in (.+)$/);
  if (checkedInMatch) {
    return `Enregistré ${checkedInMatch[1]}`;
  }

  const deadlineMatch = text.match(/^Deadline (.+)$/);
  if (deadlineMatch) {
    return `Échéance ${deadlineMatch[1]}`;
  }

  return text;
}

function translateMessage(
  locale: Locale,
  text: string,
  values?: Record<string, string | number>,
): string {
  if (locale === "en") {
    return interpolate(text, values);
  }

  const exact = FR_MESSAGES[text];
  if (exact) {
    return interpolate(exact, values);
  }

  const dynamic = translateDynamicFrench(text);
  if (dynamic !== text) {
    return interpolate(dynamic, values);
  }

  return interpolate(text, values);
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );

  useEffect(() => {
    let preferred: Locale | null = null;

    try {
      const fromStorage = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(fromStorage)) {
        preferred = fromStorage;
      }
    } catch {
      // Ignore storage read failures.
    }

    if (!preferred) {
      preferred = readLocaleFromCookie(document.cookie);
    }

    if (!preferred) {
      preferred = navigator.language?.toLowerCase().startsWith("fr")
        ? "fr"
        : DEFAULT_LOCALE;
    }

    if (preferred && preferred !== locale) {
      setLocaleState(preferred);
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage write failures.
    }

    document.cookie = `${LOCALE_COOKIE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(isLocale(next) ? next : DEFAULT_LOCALE);
  }, []);

  const t = useCallback(
    (text: string, values?: Record<string, string | number>) =>
      translateMessage(locale, text, values),
    [locale],
  );

  const contextValue = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useI18n must be used within <LocaleProvider>");
  }
  return context;
}

const TRANSFORMED_PROPS = new Set([
  "title",
  "description",
  "label",
  "placeholder",
  "aria-label",
  "ariaLabel",
  "alt",
  "confirmLabel",
  "actionLabel",
  "helperText",
]);
const SKIP_TAGS = new Set(["code", "pre", "script", "style"]);

function translateTextNode(
  value: string,
  translate: (text: string) => string,
): string {
  if (!/[A-Za-z]/.test(value)) {
    return value;
  }

  const leadingMatch = value.match(/^\s*/);
  const trailingMatch = value.match(/\s*$/);
  const leading = leadingMatch ? leadingMatch[0] : "";
  const trailing = trailingMatch ? trailingMatch[0] : "";
  const core = value.slice(leading.length, value.length - trailing.length);

  if (!core) {
    return value;
  }

  const translated = translate(core);
  if (translated === core) {
    return value;
  }

  return `${leading}${translated}${trailing}`;
}

function translateNode(
  node: ReactNode,
  translate: (text: string) => string,
): ReactNode {
  if (typeof node === "string") {
    return translateTextNode(node, translate);
  }

  if (Array.isArray(node)) {
    let changed = false;
    const translatedArray = node.map((child) => {
      const translatedChild = translateNode(child, translate);
      if (translatedChild !== child) changed = true;
      return translatedChild;
    });
    return changed ? translatedArray : node;
  }

  if (!isValidElement(node)) {
    return node;
  }

  if (typeof node.type === "string" && SKIP_TAGS.has(node.type)) {
    return node;
  }

  const element = node as ReactElement<Record<string, unknown>>;
  const props = element.props ?? {};
  const nextProps: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      const translatedChildren = translateNode(value as ReactNode, translate);
      if (translatedChildren !== value) {
        changed = true;
        nextProps.children = translatedChildren;
      }
      continue;
    }

    if (typeof value === "string" && TRANSFORMED_PROPS.has(key)) {
      const translatedProp = translateTextNode(value, translate);
      if (translatedProp !== value) {
        changed = true;
        nextProps[key] = translatedProp;
      }
    }
  }

  if (!changed) {
    return node;
  }

  return cloneElement(element, nextProps);
}

export function AutoTranslate({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();

  const translatedChildren = useMemo(
    () => (locale === "en" ? children : translateNode(children, t)),
    [children, locale, t],
  );

  return <>{translatedChildren}</>;
}
