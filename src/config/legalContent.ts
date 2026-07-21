import { LEGAL_IDENTITY, legalField } from './legal';

export type LegalPage = 'privacy' | 'legal-notice' | 'terms' | 'sales-terms';

export type LegalBlock = { p: string } | { ul: string[] };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_PATHS: Record<LegalPage, { fr: string; en: string }> = {
  privacy: { fr: '/confidentialite', en: '/en/privacy' },
  'legal-notice': { fr: '/mentions-legales', en: '/en/legal-notice' },
  terms: { fr: '/conditions-utilisation', en: '/en/terms' },
  'sales-terms': { fr: '/conditions-vente', en: '/en/sales-terms' },
};

const p = (text: string): LegalBlock => ({ p: text });
const ul = (items: string[]): LegalBlock => ({ ul: items });

const frDocuments = (): Record<LegalPage, LegalDocument> => {
  const id = LEGAL_IDENTITY;
  const name = legalField(id.legalName, 'fr', 'nom de l’éditeur');
  const address = legalField(id.address, 'fr', 'adresse de domiciliation');
  const siren = legalField(id.siren, 'fr', 'numéro SIREN');
  const director = legalField(id.publicationDirector, 'fr', 'directeur de la publication');
  const contactEmail = legalField(id.contactEmail, 'fr', 'e-mail de contact');
  const privacyEmail = legalField(id.privacyEmail, 'fr', 'e-mail données personnelles');
  const supportEmail = legalField(id.supportEmail, 'fr', 'e-mail de support');
  const mediator = legalField(id.mediator.name, 'fr', 'nom du médiateur');
  const mediatorAddress = legalField(id.mediator.address, 'fr', 'adresse du médiateur');
  const mediatorUrl = legalField(id.mediator.url, 'fr', 'site du médiateur');
  const hostName = legalField(id.hosting.name, 'fr', 'nom de l’hébergeur');
  const hostAddress = legalField(id.hosting.address, 'fr', 'adresse de l’hébergeur');
  const hostPhone = legalField(id.hosting.phone, 'fr', 'téléphone de l’hébergeur');
  const vat =
    id.vatNumber.trim().length > 0
      ? `Numéro de TVA intracommunautaire : ${id.vatNumber.trim()}.`
      : 'TVA non applicable, article 293 B du code général des impôts.';

  return {
    privacy: {
      title: 'Politique de confidentialité | Runaway',
      eyebrow: 'CONFIDENTIALITÉ',
      heading: 'Vos données financières restent les vôtres.',
      intro:
        'Cette politique décrit les données personnelles traitées par Runaway, les raisons de ces traitements, leur durée et les droits dont vous disposez.',
      sections: [
        {
          title: 'Responsable du traitement',
          blocks: [
            p(
              `Runaway est édité par ${name}, entrepreneur individuel établi à ${address}. Cette personne détermine les finalités et les moyens des traitements décrits ci-dessous et en est le responsable au sens du RGPD.`,
            ),
            p(
              `Pour toute question ou demande relative à vos données : ${privacyEmail}. Aucun délégué à la protection des données n’a été désigné, la désignation n’étant pas obligatoire au regard de l’activité.`,
            ),
          ],
        },
        {
          title: 'Deux modes d’usage, deux niveaux de traitement',
          blocks: [
            p(
              'En mode sandbox, Runaway fonctionne sans compte : les plans que vous créez sont conservés dans le stockage local de votre navigateur et ne sont pas transmis à nos serveurs. Seules les requêtes techniques nécessaires à l’affichage du site et à la récupération de données de marché transitent par nos serveurs.',
            ),
            p(
              'Avec un compte, vos plans sont enregistrés côté serveur pour être synchronisés entre vos appareils. Les traitements décrits ci-dessous s’appliquent alors dans leur ensemble.',
            ),
          ],
        },
        {
          title: 'Données traitées',
          blocks: [
            ul([
              'Données de compte : nom, adresse e-mail, statut de vérification de l’e-mail, langue d’interface et résidence fiscale déclarée, mot de passe conservé sous forme de condensat.',
              'Données de plan : montants, patrimoine, revenus, dépenses, comptes, placements et hypothèses que vous saisissez. Ces données sont sensibles par nature au sens courant du terme, sans relever des catégories particulières de l’article 9 du RGPD.',
              'Données de session et de sécurité : identifiant de session, adresse IP et agent utilisateur associés à vos connexions, journaux techniques et anti-abus.',
              'Données de support : nom, e-mail, objet et contenu des messages envoyés via le formulaire de contact.',
              'Données d’abonnement, si une offre payante est souscrite : identifiants client et abonnement Stripe, statut et échéance de l’abonnement. Les coordonnées de carte bancaire sont saisies chez Stripe et ne nous sont jamais transmises.',
              'Données de mesure d’audience et d’erreur : pages consultées, données techniques agrégées, rapports d’erreur applicative.',
            ]),
          ],
        },
        {
          title: 'Finalités et bases légales',
          blocks: [
            ul([
              'Fournir le service, créer et gérer votre compte, enregistrer et synchroniser vos plans — exécution du contrat (art. 6.1.b RGPD).',
              'Gérer un abonnement payant, encaisser le paiement, émettre les factures — exécution du contrat et obligation légale comptable (art. 6.1.b et 6.1.c).',
              'Répondre à vos demandes de support — exécution du contrat, ou intérêt légitime à répondre aux personnes qui nous écrivent sans compte (art. 6.1.b et 6.1.f).',
              'Sécuriser le service, prévenir la fraude et les abus, limiter les envois automatisés — intérêt légitime à protéger le service et ses utilisateurs (art. 6.1.f).',
              'Mesurer l’audience du site de façon agrégée et diagnostiquer les erreurs applicatives — intérêt légitime à maintenir et améliorer le service (art. 6.1.f).',
              'Envoyer les e-mails de service (vérification d’adresse, réinitialisation de mot de passe, confirmations) — exécution du contrat (art. 6.1.b).',
            ]),
            p(
              'Lorsque le traitement repose sur l’intérêt légitime, vous pouvez vous y opposer à tout moment dans les conditions décrites à la section « Vos droits ».',
            ),
          ],
        },
        {
          title: 'Cookies et mesure d’audience',
          blocks: [
            p(
              'Runaway dépose uniquement des cookies et un stockage local strictement nécessaires : cookie de session d’authentification, préférences d’interface et, en mode sandbox, sauvegarde locale de vos plans. Ces éléments sont exemptés de consentement, aucun bandeau n’est donc affiché.',
            ),
            p(
              'La mesure d’audience du site est assurée par Vercel Web Analytics, sans cookie et sans identifiant persistant permettant de vous suivre d’un site à l’autre. Aucun cookie publicitaire, aucun traceur tiers de ciblage et aucune revente de données ne sont mis en œuvre.',
            ),
          ],
        },
        {
          title: 'Destinataires et sous-traitants',
          blocks: [
            p(
              'Vos données ne sont ni vendues, ni louées, ni transmises à des tiers à des fins publicitaires. Elles sont accessibles à l’éditeur et aux prestataires techniques suivants, qui n’interviennent que pour fournir leur service et sur instruction :',
            ),
            ul([
              'Vercel Inc. — hébergement du site et de l’API, mesure d’audience.',
              'Neon Inc. — hébergement de la base de données.',
              'Resend Inc. — envoi des e-mails transactionnels et des messages de support.',
              'Functional Software, Inc. (Sentry) — collecte des rapports d’erreur applicative, configurée sans transmission d’informations personnelles par défaut.',
              'Stripe, Inc. et Stripe Payments Europe, Ltd. — paiement et gestion de l’abonnement, lorsqu’une offre payante est souscrite.',
              'Fournisseurs de données de marché — appelés côté serveur pour des cotations et taux de change ; aucune donnée personnelle ne leur est transmise.',
            ]),
            p(
              'Vos données peuvent également être communiquées à une autorité administrative ou judiciaire lorsque la loi l’exige.',
            ),
          ],
        },
        {
          title: 'Transferts hors Union européenne',
          blocks: [
            p(
              'Certains des prestataires ci-dessus sont établis aux États-Unis ou peuvent y traiter des données. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne et, lorsque le prestataire y est certifié, par le cadre de protection des données UE–États-Unis, complétés par les mesures techniques appliquées au service, notamment le chiffrement des plans avant stockage.',
            ),
            p(
              `Vous pouvez demander des précisions sur les garanties applicables à un prestataire déterminé en écrivant à ${privacyEmail}.`,
            ),
          ],
        },
        {
          title: 'Durées de conservation',
          blocks: [
            ul([
              'Compte et plans synchronisés : pendant toute la durée de vie du compte, puis suppression à la suppression du compte.',
              'Comptes inactifs : suppression après trois ans sans connexion, précédée d’une relance par e-mail.',
              'Sessions et journaux de sécurité : douze mois au maximum.',
              'Messages de support : trois ans à compter du dernier échange.',
              'Factures et pièces comptables : dix ans, conformément à l’article L123-22 du code de commerce.',
              'Données de mesure d’audience : conservées sous forme agrégée, sans possibilité de vous réidentifier.',
            ]),
            p(
              'La suppression de votre compte depuis l’application supprime en cascade vos plans, vos sessions et vos identifiants de connexion de la base applicative. Seules les pièces soumises à une obligation légale de conservation sont conservées, isolées de l’usage courant.',
            ),
          ],
        },
        {
          title: 'Sécurité',
          blocks: [
            p(
              'Le contenu de vos plans et leur nom sont chiffrés avant stockage en base (AES-256-GCM). La clé de chiffrement est détenue côté serveur : le chiffrement protège les données au repos, il ne s’agit pas d’un chiffrement de bout en bout et l’éditeur reste techniquement en mesure de déchiffrer les données lorsque le service l’exige.',
            ),
            p(
              'Les mots de passe sont conservés sous forme de condensat, jamais en clair. L’accès au compte repose sur des sessions signées, la vérification de l’adresse e-mail et une limitation du nombre de tentatives. Les échanges avec le service sont chiffrés en transit. Aucun système n’étant infaillible, ces mesures réduisent le risque sans le supprimer.',
            ),
          ],
        },
        {
          title: 'Absence de décision automatisée',
          blocks: [
            p(
              'Runaway ne prend aucune décision produisant des effets juridiques à votre égard sur le seul fondement d’un traitement automatisé, et ne réalise aucun profilage à des fins publicitaires. Les projections affichées sont des simulations hypothétiques issues des hypothèses que vous choisissez : elles vous informent, elles ne décident pas à votre place.',
            ),
          ],
        },
        {
          title: 'Vos droits',
          blocks: [
            p(
              'Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité, ainsi que du droit de définir des directives relatives au sort de vos données après votre décès. Lorsqu’un traitement repose sur votre consentement, vous pouvez le retirer à tout moment sans que cela remette en cause les traitements déjà effectués.',
            ),
            p(
              `Pour exercer ces droits, écrivez à ${privacyEmail}. Une réponse vous sera adressée dans un délai d’un mois, prolongeable de deux mois en cas de demande complexe. Une pièce justificative d’identité peut être demandée en cas de doute sérieux sur l’identité du demandeur.`,
            ),
            p(
              'Vous pouvez également introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, www.cnil.fr.',
            ),
          ],
        },
        {
          title: 'Modifications de cette politique',
          blocks: [
            p(
              'Cette politique peut évoluer avec le service. Toute modification substantielle vous sera signalée par e-mail ou dans l’application avant son entrée en vigueur. La date d’effet de la version en cours figure en tête de page.',
            ),
          ],
        },
      ],
    },

    'legal-notice': {
      title: 'Mentions légales | Runaway',
      eyebrow: 'MENTIONS LÉGALES',
      heading: 'Qui édite Runaway.',
      intro: 'Informations d’identification et de contact de l’éditeur et de l’hébergeur du site.',
      sections: [
        {
          title: 'Éditeur du site',
          blocks: [
            ul([
              `Éditeur : ${name}, entrepreneur individuel.`,
              `Adresse : ${address}.`,
              `SIREN : ${siren}.`,
              `Contact : ${contactEmail}.`,
              vat,
            ]),
          ],
        },
        {
          title: 'Directeur de la publication',
          blocks: [p(`${director}, en qualité d’éditeur du site.`)],
        },
        {
          title: 'Hébergeur',
          blocks: [
            ul([
              `Hébergeur du site et de l’API : ${hostName}.`,
              `Adresse : ${hostAddress}.`,
              `Téléphone : ${hostPhone}.`,
            ]),
            p(
              'La base de données applicative est hébergée par Neon Inc. La liste complète des prestataires figure dans la politique de confidentialité.',
            ),
          ],
        },
        {
          title: 'Propriété intellectuelle',
          blocks: [
            p(
              'Le nom Runaway, l’identité visuelle, les textes, les interfaces, les méthodes de calcul décrites et le code du service sont protégés par le droit de la propriété intellectuelle. Toute reproduction, extraction, réutilisation ou adaptation, totale ou partielle, sans autorisation écrite préalable est interdite, à l’exception des usages autorisés par la loi.',
            ),
            p(
              'Les plans, montants et hypothèses que vous saisissez restent votre propriété. L’éditeur n’en acquiert aucun droit au-delà de ce qui est nécessaire pour fournir le service.',
            ),
          ],
        },
        {
          title: 'Signalement de contenu',
          blocks: [
            p(
              `Tout contenu manifestement illicite accessible sur le site peut être signalé à ${contactEmail}. Le signalement doit décrire le contenu concerné et sa localisation précise afin de permettre son examen.`,
            ),
          ],
        },
        {
          title: 'Données personnelles',
          blocks: [
            p(
              'Le traitement des données personnelles est détaillé dans la politique de confidentialité, accessible depuis le pied de page du site.',
            ),
          ],
        },
      ],
    },

    terms: {
      title: 'Conditions générales d’utilisation | Runaway',
      eyebrow: 'CONDITIONS D’UTILISATION',
      heading: 'Utiliser Runaway de façon éclairée.',
      intro:
        'Ces conditions encadrent l’accès au service de simulation et de planification financière Runaway et s’appliquent à tout utilisateur, avec ou sans compte.',
      sections: [
        {
          title: 'Objet et acceptation',
          blocks: [
            p(
              `Les présentes conditions régissent l’utilisation du site runaway.money et de l’application Runaway, édités par ${name}. Utiliser le service vaut acceptation de ces conditions. Si vous ne les acceptez pas, n’utilisez pas le service.`,
            ),
            p(
              'Le service est réservé aux personnes majeures ou disposant de la capacité juridique nécessaire pour contracter.',
            ),
          ],
        },
        {
          title: 'Nature du service',
          blocks: [
            p(
              'Runaway est un outil de visualisation, de simulation et d’aide à la réflexion. Il calcule des trajectoires patrimoniales hypothétiques à partir des données et des hypothèses que vous saisissez, selon des modèles décrits sur la page Méthodologie.',
            ),
            p(
              'Les résultats affichés sont des projections, non des prévisions. Ils dépendent entièrement de la qualité des données saisies et des hypothèses retenues, notamment de rendement, d’inflation, de fiscalité et de durée. Modifier une hypothèse modifie le résultat.',
            ),
          ],
        },
        {
          title: 'Absence de conseil personnalisé',
          blocks: [
            p(
              'Runaway ne fournit aucun conseil en investissement, aucune recommandation personnalisée, aucun conseil fiscal, juridique ou patrimonial. L’éditeur n’est pas conseiller en investissements financiers et n’exerce aucune activité réglementée à ce titre.',
            ),
            p(
              'Aucun résultat n’est garanti. Une projection favorable ne préjuge d’aucun rendement futur, et les performances passées utilisées par les modèles historiques ne préjugent pas des performances futures. Vous restez seul décideur de vos arbitrages financiers et il vous appartient de consulter un professionnel qualifié lorsque votre situation le justifie.',
            ),
          ],
        },
        {
          title: 'Modes d’accès : sandbox et compte',
          blocks: [
            p(
              'Le service est accessible en mode sandbox, sans compte : les plans sont alors conservés localement dans votre navigateur. Vider les données du navigateur, changer d’appareil ou utiliser une navigation privée peut entraîner leur perte définitive, sans possibilité de récupération par l’éditeur.',
            ),
            p(
              'La création d’un compte permet la sauvegarde et la synchronisation de vos plans entre appareils. Vous êtes responsable de l’exactitude des informations saisies et de la confidentialité de vos identifiants, et vous devez signaler sans délai toute utilisation non autorisée de votre compte.',
            ),
          ],
        },
        {
          title: 'Offre gratuite et offre Premium',
          blocks: [
            p(
              'Le service comprend une offre gratuite et, lorsqu’elle est proposée, une offre Premium payante donnant accès à des fonctionnalités supplémentaires. Le périmètre exact de chaque offre est celui affiché dans l’application au moment de son utilisation.',
            ),
            p(
              'Les conditions financières de l’offre Premium, y compris le prix, la durée, le renouvellement et le droit de rétractation, figurent dans les conditions générales de vente.',
            ),
          ],
        },
        {
          title: 'Vos données et vos plans',
          blocks: [
            p(
              'Vous conservez l’entière propriété des données et des plans que vous saisissez. Vous concédez à l’éditeur, pour la seule durée nécessaire à la fourniture du service, le droit d’héberger, de stocker, de chiffrer et de restituer ces contenus, à l’exclusion de tout autre usage.',
            ),
            p(
              'Vous garantissez disposer du droit de saisir les informations que vous introduisez dans le service, en particulier lorsqu’elles concernent un tiers.',
            ),
          ],
        },
        {
          title: 'Usage autorisé',
          blocks: [
            p(
              'Vous pouvez utiliser le service pour vos besoins personnels ou professionnels internes, dans le respect des lois applicables. Sont notamment interdits :',
            ),
            ul([
              'le contournement ou la tentative de contournement des mesures de sécurité, des limitations d’offre ou des quotas techniques ;',
              'l’extraction automatisée, la copie massive ou la réutilisation des contenus, des données de marché ou du code du service ;',
              'toute action visant à perturber, surcharger ou dégrader le service, y compris les envois automatisés via le formulaire de contact ;',
              'la revente, la mise à disposition ou l’exploitation du service au profit d’un tiers sans autorisation écrite préalable.',
            ]),
          ],
        },
        {
          title: 'Disponibilité et évolution du service',
          blocks: [
            p(
              'Le service est fourni en l’état, dans la limite de sa disponibilité. L’éditeur peut le faire évoluer, en modifier les fonctionnalités, ou en suspendre tout ou partie pour des raisons techniques, de sécurité ou de maintenance.',
            ),
            p(
              'Les données de marché affichées proviennent de sources tierces et peuvent être différées, incomplètes ou momentanément indisponibles. Elles sont fournies à titre indicatif.',
            ),
            p(
              'En cas d’arrêt définitif du service, un délai raisonnable vous sera laissé pour exporter vos plans avant la suppression des données.',
            ),
          ],
        },
        {
          title: 'Responsabilité',
          blocks: [
            p(
              'L’éditeur est responsable des dommages directs et prévisibles résultant d’un manquement qui lui est imputable. Sa responsabilité ne peut en revanche être engagée à raison des décisions financières, fiscales ou patrimoniales que vous prenez, des hypothèses que vous retenez, de l’inexactitude des données que vous saisissez, ni de l’évolution réelle des marchés, de la fiscalité ou de votre situation.',
            ),
            p(
              'Sauf faute lourde ou dolosive, et dans la limite permise par la loi, la responsabilité de l’éditeur au titre du service est plafonnée aux sommes que vous lui avez effectivement versées au cours des douze mois précédant le fait générateur. Les dommages indirects, notamment la perte de chance, le manque à gagner ou la perte d’opportunité d’investissement, sont exclus.',
            ),
            p(
              'Aucune stipulation des présentes ne limite les droits impératifs reconnus aux consommateurs ni la responsabilité qui ne peut légalement être exclue.',
            ),
          ],
        },
        {
          title: 'Suspension et résiliation',
          blocks: [
            p(
              'Vous pouvez supprimer votre compte à tout moment depuis l’application ; la suppression entraîne celle de vos plans dans les conditions décrites par la politique de confidentialité.',
            ),
            p(
              'L’éditeur peut suspendre ou résilier un accès en cas de manquement grave aux présentes conditions, d’usage frauduleux ou de risque avéré pour le service ou ses utilisateurs. Sauf urgence ou obligation légale, la suspension est précédée d’une information par e-mail. Lorsqu’un abonnement en cours est résilié pour un motif non imputable à l’utilisateur, la fraction non utilisée lui est remboursée.',
            ),
          ],
        },
        {
          title: 'Modification des conditions',
          blocks: [
            p(
              'Ces conditions peuvent être modifiées pour tenir compte de l’évolution du service ou de la réglementation. Toute modification substantielle est portée à votre connaissance par e-mail ou dans l’application au moins trente jours avant son entrée en vigueur. La poursuite de l’utilisation après cette date vaut acceptation ; à défaut, vous pouvez supprimer votre compte.',
            ),
          ],
        },
        {
          title: 'Droit applicable et litiges',
          blocks: [
            p(
              'Les présentes conditions sont régies par le droit français, sans préjudice des dispositions impératives plus protectrices applicables dans votre pays de résidence habituelle.',
            ),
            p(
              `En cas de difficulté, contactez d’abord ${contactEmail}. Un consommateur peut ensuite saisir gratuitement le médiateur de la consommation dans les conditions indiquées par les conditions générales de vente, ou la plateforme européenne de règlement en ligne des litiges. À défaut d’accord, le litige relève des juridictions compétentes selon les règles de droit commun.`,
            ),
          ],
        },
      ],
    },

    'sales-terms': {
      title: 'Conditions générales de vente | Runaway',
      eyebrow: 'CONDITIONS DE VENTE',
      heading: 'Les règles de l’abonnement Premium.',
      intro:
        'Ces conditions régissent la souscription à l’offre Premium de Runaway et complètent les conditions générales d’utilisation.',
      sections: [
        {
          title: 'Vendeur',
          blocks: [
            ul([
              `Vendeur : ${name}, entrepreneur individuel.`,
              `Adresse : ${address}.`,
              `SIREN : ${siren}.`,
              `Contact commande et réclamation : ${supportEmail}.`,
              vat,
            ]),
          ],
        },
        {
          title: 'Champ d’application',
          blocks: [
            p(
              'Ces conditions s’appliquent à toute souscription à l’offre Premium, qu’elle soit réalisée par un consommateur ou par un professionnel. Elles sont acceptées lors de la validation de la commande et prévalent sur tout autre document. La version applicable est celle en vigueur à la date de la commande.',
            ),
          ],
        },
        {
          title: 'Caractéristiques essentielles de l’offre',
          blocks: [
            p(
              'L’offre Premium donne accès, pour la durée souscrite, aux fonctionnalités présentées comme réservées à cette offre dans l’application. Il s’agit d’un service numérique fourni en ligne, sans support matériel, accessible depuis un navigateur récent et une connexion internet.',
            ),
            p(
              'Le périmètre exact, la durée et le prix applicables sont ceux affichés sur la page de commande avant validation du paiement. L’offre gratuite reste accessible sans souscription.',
            ),
          ],
        },
        {
          title: 'Prix et taxes',
          blocks: [
            p(
              'Les prix sont indiqués sur la page de commande, dans la devise qui y est affichée, taxes comprises le cas échéant. Le montant total à payer est présenté avant la validation définitive de la commande.',
            ),
            p(vat),
            p(
              'Les prix peuvent évoluer. Une modification de prix ne s’applique jamais à une période déjà payée ; elle prend effet au renouvellement suivant et vous est notifiée au moins trente jours à l’avance, avec la possibilité de résilier avant la prise d’effet.',
            ),
          ],
        },
        {
          title: 'Commande et paiement',
          blocks: [
            p(
              'La commande suit les étapes suivantes : sélection de l’offre dans l’application, redirection vers la page de paiement sécurisée opérée par Stripe, saisie des coordonnées bancaires, vérification et validation du paiement. La validation du paiement forme le contrat.',
            ),
            p(
              'Le paiement est traité par Stripe. Les coordonnées de carte sont collectées et conservées par Stripe selon ses propres conditions ; elles ne transitent pas par les serveurs de Runaway et n’y sont jamais stockées. Une confirmation est adressée à l’adresse e-mail associée au compte.',
            ),
            p(
              'En cas de rejet ou de défaut de paiement, l’accès aux fonctionnalités Premium peut être suspendu après information par e-mail, sans que cela affecte l’accès à l’offre gratuite ni vos plans enregistrés.',
            ),
          ],
        },
        {
          title: 'Durée, renouvellement et résiliation',
          blocks: [
            p(
              'L’abonnement est souscrit pour la période affichée lors de la commande et se renouvelle automatiquement par période identique, jusqu’à résiliation.',
            ),
            p(
              'Vous pouvez résilier à tout moment depuis le portail de facturation accessible dans votre compte. La résiliation prend effet à la fin de la période en cours : l’accès Premium est conservé jusqu’à cette échéance et aucun nouveau prélèvement n’est effectué. Aucun remboursement au prorata n’est dû pour la période entamée, sauf disposition légale contraire ou résiliation imputable au vendeur.',
            ),
            p(
              'Conformément à l’article L215-1 du code de la consommation, le consommateur est informé par écrit, au plus tôt trois mois et au plus tard un mois avant l’échéance, de la possibilité de ne pas reconduire l’abonnement.',
            ),
          ],
        },
        {
          title: 'Droit de rétractation',
          blocks: [
            p(
              'Le consommateur dispose d’un délai de quatorze jours à compter de la conclusion du contrat pour se rétracter, sans motif ni pénalité, en écrivant à ' +
                supportEmail +
                ' ou en utilisant le formulaire type de rétractation. Le remboursement intervient dans les quatorze jours suivant la réception de la demande, par le même moyen de paiement.',
            ),
            p(
              'L’offre Premium étant un contenu numérique fourni immédiatement, la perte du droit de rétractation suppose, conformément à l’article L221-28 13° du code de la consommation, votre accord exprès pour que l’exécution commence avant la fin du délai et la reconnaissance de la perte de ce droit qui en résulte. Tant que ces deux confirmations ne sont pas recueillies au moment de la commande, le droit de rétractation reste entier.',
            ),
            p(
              'Ce droit ne s’applique pas aux souscriptions réalisées par un professionnel dans le cadre de son activité, sous réserve des cas prévus par l’article L221-3 du code de la consommation.',
            ),
          ],
        },
        {
          title: 'Factures',
          blocks: [
            p(
              'Une facture est émise pour chaque échéance et reste accessible depuis le portail de facturation de votre compte. Les documents comptables sont conservés dix ans conformément à l’article L123-22 du code de commerce.',
            ),
          ],
        },
        {
          title: 'Garanties légales',
          blocks: [
            p(
              'Le consommateur bénéficie de la garantie légale de conformité du contenu numérique prévue aux articles L224-25-12 et suivants du code de la consommation, ainsi que de la garantie contre les vices cachés des articles 1641 et suivants du code civil. Ces garanties s’exercent indépendamment de toute garantie commerciale.',
            ),
            p(
              'Au titre de la garantie de conformité, le vendeur est tenu de mettre le service en conformité ; à défaut, une réduction du prix ou la résolution du contrat peut être demandée dans les conditions prévues par la loi.',
            ),
          ],
        },
        {
          title: 'Support et réclamations',
          blocks: [
            p(
              `Pour toute question ou réclamation relative à une commande, écrivez à ${supportEmail}. Une réponse est apportée dans les meilleurs délais et, en tout état de cause, dans un délai raisonnable.`,
            ),
          ],
        },
        {
          title: 'Médiation et litiges',
          blocks: [
            p(
              `Après une réclamation écrite restée sans solution, le consommateur peut recourir gratuitement au médiateur de la consommation : ${mediator}, ${mediatorAddress}, ${mediatorUrl}.`,
            ),
            p(
              'La plateforme européenne de règlement en ligne des litiges est également accessible à l’adresse ec.europa.eu/consumers/odr.',
            ),
            p(
              'Les présentes conditions sont régies par le droit français, sans préjudice des dispositions impératives plus protectrices du pays de résidence habituelle du consommateur. À défaut de résolution amiable, le litige relève des juridictions compétentes selon les règles de droit commun.',
            ),
          ],
        },
      ],
    },
  };
};

const enDocuments = (): Record<LegalPage, LegalDocument> => {
  const id = LEGAL_IDENTITY;
  const name = legalField(id.legalName, 'en', 'operator legal name');
  const address = legalField(id.address, 'en', 'business address');
  const siren = legalField(id.siren, 'en', 'SIREN number');
  const director = legalField(id.publicationDirector, 'en', 'publication director');
  const contactEmail = legalField(id.contactEmail, 'en', 'contact email');
  const privacyEmail = legalField(id.privacyEmail, 'en', 'privacy email');
  const supportEmail = legalField(id.supportEmail, 'en', 'support email');
  const mediator = legalField(id.mediator.name, 'en', 'mediator name');
  const mediatorAddress = legalField(id.mediator.address, 'en', 'mediator address');
  const mediatorUrl = legalField(id.mediator.url, 'en', 'mediator website');
  const hostName = legalField(id.hosting.name, 'en', 'host name');
  const hostAddress = legalField(id.hosting.address, 'en', 'host address');
  const hostPhone = legalField(id.hosting.phone, 'en', 'host phone number');
  const vat =
    id.vatNumber.trim().length > 0
      ? `EU VAT number: ${id.vatNumber.trim()}.`
      : 'VAT not applicable under article 293 B of the French tax code.';

  return {
    privacy: {
      title: 'Privacy policy | Runaway',
      eyebrow: 'PRIVACY',
      heading: 'Your financial data remains yours.',
      intro:
        'This policy describes the personal data Runaway processes, why it is processed, how long it is kept, and the rights available to you.',
      sections: [
        {
          title: 'Data controller',
          blocks: [
            p(
              `Runaway is operated by ${name}, a sole proprietor established at ${address}. This person determines the purposes and means of the processing described below and is the controller under the GDPR.`,
            ),
            p(
              `For any question or request about your data: ${privacyEmail}. No data protection officer has been appointed, as the appointment is not mandatory for this activity.`,
            ),
          ],
        },
        {
          title: 'Two modes of use, two levels of processing',
          blocks: [
            p(
              'In sandbox mode, Runaway works without an account: the plans you create stay in your browser storage and are not sent to our servers. Only the technical requests needed to display the site and fetch market data pass through our servers.',
            ),
            p(
              'With an account, your plans are stored server-side so they can sync across devices. All of the processing described below then applies.',
            ),
          ],
        },
        {
          title: 'Data we process',
          blocks: [
            ul([
              'Account data: name, email address, email verification status, interface language and declared tax residence, and a hashed password.',
              'Plan data: amounts, assets, income, spending, accounts, holdings and assumptions you enter. This data is sensitive in the everyday sense, though it does not fall within the special categories of article 9 GDPR.',
              'Session and security data: session identifier, IP address and user agent tied to your sign-ins, technical and anti-abuse logs.',
              'Support data: name, email, subject and content of messages sent through the contact form.',
              'Subscription data, where a paid plan is taken: Stripe customer and subscription identifiers, subscription status and expiry. Card details are entered at Stripe and never reach us.',
              'Audience measurement and error data: pages viewed, aggregated technical data, application error reports.',
            ]),
          ],
        },
        {
          title: 'Purposes and legal bases',
          blocks: [
            ul([
              'Providing the service, creating and managing your account, saving and syncing your plans — performance of the contract (art. 6(1)(b) GDPR).',
              'Managing a paid subscription, collecting payment, issuing invoices — performance of the contract and legal accounting obligation (art. 6(1)(b) and 6(1)(c)).',
              'Answering support requests — performance of the contract, or legitimate interest in replying to people who write to us without an account (art. 6(1)(b) and 6(1)(f)).',
              'Securing the service, preventing fraud and abuse, rate-limiting automated submissions — legitimate interest in protecting the service and its users (art. 6(1)(f)).',
              'Measuring site audience in aggregate and diagnosing application errors — legitimate interest in maintaining and improving the service (art. 6(1)(f)).',
              'Sending service emails (address verification, password reset, confirmations) — performance of the contract (art. 6(1)(b)).',
            ]),
            p(
              'Where processing relies on legitimate interest, you may object at any time under the conditions set out in "Your rights".',
            ),
          ],
        },
        {
          title: 'Cookies and audience measurement',
          blocks: [
            p(
              'Runaway only sets strictly necessary cookies and local storage: the authentication session cookie, interface preferences and, in sandbox mode, the local copy of your plans. These are exempt from consent, so no banner is displayed.',
            ),
            p(
              'Site audience measurement uses Vercel Web Analytics, without cookies and without a persistent identifier that could track you across sites. No advertising cookies, no third-party tracking and no sale of data are involved.',
            ),
          ],
        },
        {
          title: 'Recipients and processors',
          blocks: [
            p(
              'Your data is never sold, rented or shared with third parties for advertising. It is accessible to the operator and to the following technical providers, which act only to deliver their service and on instruction:',
            ),
            ul([
              'Vercel Inc. — hosting of the site and API, audience measurement.',
              'Neon Inc. — database hosting.',
              'Resend Inc. — transactional and support email delivery.',
              'Functional Software, Inc. (Sentry) — application error reports, configured not to forward personal information by default.',
              'Stripe, Inc. and Stripe Payments Europe, Ltd. — payment and subscription management, where a paid plan is taken.',
              'Market data providers — called server-side for quotes and exchange rates; no personal data is sent to them.',
            ]),
            p(
              'Data may also be disclosed to an administrative or judicial authority where the law requires it.',
            ),
          ],
        },
        {
          title: 'Transfers outside the European Union',
          blocks: [
            p(
              'Some of the providers above are established in the United States or may process data there. Those transfers rely on the European Commission’s standard contractual clauses and, where the provider is certified, on the EU–US Data Privacy Framework, supplemented by the technical measures applied to the service, in particular the encryption of plans before storage.',
            ),
            p(
              `You can ask for details of the safeguards applying to a specific provider by writing to ${privacyEmail}.`,
            ),
          ],
        },
        {
          title: 'Retention periods',
          blocks: [
            ul([
              'Account and synced plans: for the life of the account, deleted when the account is deleted.',
              'Inactive accounts: deleted after three years without sign-in, preceded by an email reminder.',
              'Sessions and security logs: twelve months at most.',
              'Support messages: three years from the last exchange.',
              'Invoices and accounting records: ten years, under article L123-22 of the French commercial code.',
              'Audience measurement data: kept in aggregate form, with no way to re-identify you.',
            ]),
            p(
              'Deleting your account from the app cascades to your plans, sessions and sign-in credentials in the application database. Only records subject to a legal retention obligation are kept, separated from day-to-day use.',
            ),
          ],
        },
        {
          title: 'Security',
          blocks: [
            p(
              'Plan contents and plan names are encrypted before being written to the database (AES-256-GCM). The encryption key is held server-side: this protects data at rest, it is not end-to-end encryption, and the operator remains technically able to decrypt data where the service requires it.',
            ),
            p(
              'Passwords are stored hashed, never in clear text. Account access relies on signed sessions, email verification and attempt rate-limiting. Traffic to the service is encrypted in transit. No system is infallible, so these measures reduce risk rather than remove it.',
            ),
          ],
        },
        {
          title: 'No automated decision-making',
          blocks: [
            p(
              'Runaway makes no decision producing legal effects concerning you based solely on automated processing, and performs no profiling for advertising. The projections shown are hypothetical simulations built from the assumptions you choose: they inform you, they do not decide for you.',
            ),
          ],
        },
        {
          title: 'Your rights',
          blocks: [
            p(
              'You have the rights of access, rectification, erasure, restriction, objection and portability, as well as the right to give directions on what happens to your data after your death. Where processing relies on your consent, you may withdraw it at any time without affecting processing already carried out.',
            ),
            p(
              `To exercise these rights, write to ${privacyEmail}. You will receive a reply within one month, extendable by two months for complex requests. Proof of identity may be requested where there is serious doubt about the requester's identity.`,
            ),
            p(
              'You may also lodge a complaint with the French data protection authority: CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, www.cnil.fr.',
            ),
          ],
        },
        {
          title: 'Changes to this policy',
          blocks: [
            p(
              'This policy may change as the service evolves. Any substantial change will be signalled by email or in the app before it takes effect. The effective date of the current version appears at the top of this page.',
            ),
          ],
        },
      ],
    },

    'legal-notice': {
      title: 'Legal notice | Runaway',
      eyebrow: 'LEGAL NOTICE',
      heading: 'Who operates Runaway.',
      intro: 'Identification and contact information for the operator and the host of the site.',
      sections: [
        {
          title: 'Site operator',
          blocks: [
            ul([
              `Operator: ${name}, sole proprietor.`,
              `Address: ${address}.`,
              `SIREN: ${siren}.`,
              `Contact: ${contactEmail}.`,
              vat,
            ]),
          ],
        },
        {
          title: 'Publication director',
          blocks: [p(`${director}, as operator of the site.`)],
        },
        {
          title: 'Host',
          blocks: [
            ul([
              `Host of the site and API: ${hostName}.`,
              `Address: ${hostAddress}.`,
              `Phone: ${hostPhone}.`,
            ]),
            p(
              'The application database is hosted by Neon Inc. The full list of providers is set out in the privacy policy.',
            ),
          ],
        },
        {
          title: 'Intellectual property',
          blocks: [
            p(
              'The Runaway name, visual identity, texts, interfaces, documented calculation methods and service code are protected by intellectual property law. Any reproduction, extraction, reuse or adaptation, in whole or in part, without prior written authorization is prohibited, except for uses permitted by law.',
            ),
            p(
              'The plans, amounts and assumptions you enter remain yours. The operator acquires no rights over them beyond what is necessary to provide the service.',
            ),
          ],
        },
        {
          title: 'Reporting content',
          blocks: [
            p(
              `Manifestly unlawful content accessible on the site can be reported to ${contactEmail}. A report should describe the content concerned and its precise location so that it can be reviewed.`,
            ),
          ],
        },
        {
          title: 'Personal data',
          blocks: [
            p(
              'The processing of personal data is described in the privacy policy, linked from the footer of every page.',
            ),
          ],
        },
      ],
    },

    terms: {
      title: 'Terms of use | Runaway',
      eyebrow: 'TERMS OF USE',
      heading: 'Using Runaway with clarity.',
      intro:
        'These terms govern access to the Runaway financial simulation and planning service and apply to every user, with or without an account.',
      sections: [
        {
          title: 'Scope and acceptance',
          blocks: [
            p(
              `These terms govern use of runaway.money and of the Runaway application, operated by ${name}. Using the service means accepting them. If you do not accept them, do not use the service.`,
            ),
            p(
              'The service is intended for adults, or for anyone otherwise having the legal capacity to contract.',
            ),
          ],
        },
        {
          title: 'What the service is',
          blocks: [
            p(
              'Runaway is a visualization, simulation and thinking tool. It computes hypothetical wealth trajectories from the data and assumptions you enter, using the models described on the Methodology page.',
            ),
            p(
              'The results shown are projections, not forecasts. They depend entirely on the quality of the data entered and on the assumptions chosen, particularly for returns, inflation, taxation and time horizon. Change an assumption and the result changes.',
            ),
          ],
        },
        {
          title: 'No personalized advice',
          blocks: [
            p(
              'Runaway provides no investment advice, no personalized recommendation, and no tax, legal or wealth-management advice. The operator is not a registered investment adviser and carries out no regulated activity of that kind.',
            ),
            p(
              'No outcome is guaranteed. A favourable projection implies nothing about future returns, and the past performance used by the historical models does not predict future performance. You remain the sole decision-maker for your financial choices, and it is for you to consult a qualified professional where your circumstances warrant it.',
            ),
          ],
        },
        {
          title: 'Access modes: sandbox and account',
          blocks: [
            p(
              'The service is available in sandbox mode without an account: plans are then kept locally in your browser. Clearing browser data, switching devices or using private browsing can permanently lose them, with no way for the operator to recover them.',
            ),
            p(
              'Creating an account allows plans to be saved and synced across devices. You are responsible for the accuracy of the information you enter and for the confidentiality of your credentials, and you must report any unauthorized use of your account without delay.',
            ),
          ],
        },
        {
          title: 'Free and Premium plans',
          blocks: [
            p(
              'The service includes a free plan and, where offered, a paid Premium plan giving access to additional features. The exact scope of each plan is the one displayed in the app at the time of use.',
            ),
            p(
              'The financial terms of the Premium plan, including price, term, renewal and withdrawal rights, are set out in the sales terms.',
            ),
          ],
        },
        {
          title: 'Your data and your plans',
          blocks: [
            p(
              'You retain full ownership of the data and plans you enter. You grant the operator, for only as long as necessary to provide the service, the right to host, store, encrypt and return this content, and for no other purpose.',
            ),
            p(
              'You warrant that you are entitled to enter the information you put into the service, in particular where it concerns a third party.',
            ),
          ],
        },
        {
          title: 'Permitted use',
          blocks: [
            p(
              'You may use the service for personal or internal professional purposes, in compliance with applicable law. The following are prohibited:',
            ),
            ul([
              'circumventing or attempting to circumvent security measures, plan limits or technical quotas;',
              'automated extraction, bulk copying or reuse of the content, market data or code of the service;',
              'any action intended to disrupt, overload or degrade the service, including automated submissions through the contact form;',
              'reselling, redistributing or operating the service for a third party without prior written authorization.',
            ]),
          ],
        },
        {
          title: 'Availability and changes',
          blocks: [
            p(
              'The service is provided as is, subject to availability. The operator may change it, alter its features, or suspend all or part of it for technical, security or maintenance reasons.',
            ),
            p(
              'Market data shown comes from third-party sources and may be delayed, incomplete or temporarily unavailable. It is provided for information only.',
            ),
            p(
              'If the service is permanently discontinued, you will be given a reasonable period to export your plans before data is deleted.',
            ),
          ],
        },
        {
          title: 'Liability',
          blocks: [
            p(
              'The operator is liable for direct and foreseeable damage resulting from a failure attributable to it. It is not liable for the financial, tax or wealth-management decisions you make, for the assumptions you choose, for inaccuracies in the data you enter, or for how markets, taxation or your own situation actually evolve.',
            ),
            p(
              'Except in cases of gross negligence or wilful misconduct, and to the extent permitted by law, the operator’s liability in connection with the service is capped at the amounts you have actually paid to it during the twelve months preceding the triggering event. Indirect damage, including loss of chance, loss of profit and lost investment opportunity, is excluded.',
            ),
            p(
              'Nothing in these terms limits mandatory consumer rights or any liability that cannot lawfully be excluded.',
            ),
          ],
        },
        {
          title: 'Suspension and termination',
          blocks: [
            p(
              'You can delete your account at any time from the app; deletion removes your plans as described in the privacy policy.',
            ),
            p(
              'The operator may suspend or terminate access in the event of a serious breach of these terms, fraudulent use, or a demonstrated risk to the service or its users. Except in urgent cases or where the law requires otherwise, suspension is preceded by an email notice. Where an active subscription is terminated for a reason not attributable to the user, the unused portion is refunded.',
            ),
          ],
        },
        {
          title: 'Changes to these terms',
          blocks: [
            p(
              'These terms may be amended to reflect changes to the service or to the law. Any substantial change is notified by email or in the app at least thirty days before it takes effect. Continuing to use the service after that date constitutes acceptance; otherwise you can delete your account.',
            ),
          ],
        },
        {
          title: 'Governing law and disputes',
          blocks: [
            p(
              'These terms are governed by French law, without prejudice to more protective mandatory provisions applicable in your country of habitual residence.',
            ),
            p(
              `If a problem arises, contact ${contactEmail} first. A consumer may then refer the matter free of charge to the consumer mediator identified in the sales terms, or use the European online dispute resolution platform. Failing agreement, the dispute falls to the courts having jurisdiction under ordinary rules.`,
            ),
          ],
        },
      ],
    },

    'sales-terms': {
      title: 'Sales terms | Runaway',
      eyebrow: 'SALES TERMS',
      heading: 'Rules for the Premium subscription.',
      intro: 'These terms govern subscriptions to Runaway Premium and complement the terms of use.',
      sections: [
        {
          title: 'Seller',
          blocks: [
            ul([
              `Seller: ${name}, sole proprietor.`,
              `Address: ${address}.`,
              `SIREN: ${siren}.`,
              `Orders and complaints: ${supportEmail}.`,
              vat,
            ]),
          ],
        },
        {
          title: 'Scope',
          blocks: [
            p(
              'These terms apply to every Premium subscription, whether taken by a consumer or by a business. They are accepted when the order is confirmed and prevail over any other document. The applicable version is the one in force on the order date.',
            ),
          ],
        },
        {
          title: 'Essential characteristics of the offer',
          blocks: [
            p(
              'Premium gives access, for the term subscribed, to the features presented in the app as reserved to that plan. It is a digital service delivered online, with no physical medium, accessible from a recent browser and an internet connection.',
            ),
            p(
              'The exact scope, term and price are those displayed on the order page before payment is confirmed. The free plan remains available without any subscription.',
            ),
          ],
        },
        {
          title: 'Prices and taxes',
          blocks: [
            p(
              'Prices are shown on the order page, in the currency displayed there, inclusive of tax where applicable. The total amount payable is shown before the order is finally confirmed.',
            ),
            p(vat),
            p(
              'Prices may change. A price change never applies to a period already paid for; it takes effect at the next renewal and is notified at least thirty days in advance, with the option to cancel before it applies.',
            ),
          ],
        },
        {
          title: 'Order and payment',
          blocks: [
            p(
              'An order follows these steps: selecting the plan in the app, redirection to the secure payment page operated by Stripe, entering card details, review and payment confirmation. Confirmed payment forms the contract.',
            ),
            p(
              'Payment is handled by Stripe. Card details are collected and stored by Stripe under its own terms; they do not pass through Runaway’s servers and are never stored there. A confirmation is sent to the email address associated with the account.',
            ),
            p(
              'If payment is declined or fails, access to Premium features may be suspended after an email notice, without affecting access to the free plan or your saved plans.',
            ),
          ],
        },
        {
          title: 'Term, renewal and cancellation',
          blocks: [
            p(
              'The subscription runs for the period displayed at checkout and renews automatically for identical periods until cancelled.',
            ),
            p(
              'You can cancel at any time from the billing portal available in your account. Cancellation takes effect at the end of the current period: Premium access continues until then and no further charge is made. No pro-rata refund is due for a period already started, unless the law provides otherwise or the cancellation is attributable to the seller.',
            ),
            p(
              'Under article L215-1 of the French consumer code, consumers are informed in writing, at the earliest three months and at the latest one month before the renewal date, that they may choose not to renew.',
            ),
          ],
        },
        {
          title: 'Right of withdrawal',
          blocks: [
            p(
              `Consumers have fourteen days from the conclusion of the contract to withdraw, without reason or penalty, by writing to ${supportEmail} or using the model withdrawal form. Refunds are made within fourteen days of receiving the request, using the same payment method.`,
            ),
            p(
              'Because Premium is digital content supplied immediately, losing the right of withdrawal requires, under article L221-28 13° of the French consumer code, your express agreement that performance begin before the period ends together with your acknowledgement that you thereby lose that right. Until both confirmations are collected at the time of the order, the right of withdrawal remains intact.',
            ),
            p(
              'This right does not apply to subscriptions taken by a business acting within its trade, subject to the cases set out in article L221-3 of the French consumer code.',
            ),
          ],
        },
        {
          title: 'Invoices',
          blocks: [
            p(
              'An invoice is issued for each billing period and remains available from the billing portal in your account. Accounting records are kept for ten years under article L123-22 of the French commercial code.',
            ),
          ],
        },
        {
          title: 'Legal guarantees',
          blocks: [
            p(
              'Consumers benefit from the legal guarantee of conformity for digital content under articles L224-25-12 et seq. of the French consumer code, and from the guarantee against hidden defects under articles 1641 et seq. of the French civil code. These apply independently of any commercial warranty.',
            ),
            p(
              'Under the guarantee of conformity, the seller must bring the service into conformity; failing that, a price reduction or termination of the contract may be sought under the conditions set out by law.',
            ),
          ],
        },
        {
          title: 'Support and complaints',
          blocks: [
            p(
              `For any question or complaint about an order, write to ${supportEmail}. A reply is provided as soon as possible and in any event within a reasonable time.`,
            ),
          ],
        },
        {
          title: 'Mediation and disputes',
          blocks: [
            p(
              `Where a written complaint has not been resolved, consumers may refer the matter free of charge to the consumer mediator: ${mediator}, ${mediatorAddress}, ${mediatorUrl}.`,
            ),
            p(
              'The European online dispute resolution platform is also available at ec.europa.eu/consumers/odr.',
            ),
            p(
              'These terms are governed by French law, without prejudice to more protective mandatory provisions of the consumer’s country of habitual residence. Failing an amicable resolution, the dispute falls to the courts having jurisdiction under ordinary rules.',
            ),
          ],
        },
      ],
    },
  };
};

export const legalDocument = (lang: 'fr' | 'en', page: LegalPage): LegalDocument =>
  (lang === 'fr' ? frDocuments() : enDocuments())[page];
