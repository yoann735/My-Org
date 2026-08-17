/* EdTop — actions de la barre de titre : bascule de thème, retour au hub
   multi-apps, avatar. `onHub` omis ⇒ le bouton hub n'est pas rendu (cas d'une
   app ouverte seule). Rendu ici dans une vraie topbar, comme dans l'app. */
import { EdTop } from 'mealweek';

const Topbar = ({ titre, ...props }: any) => (
  <div className="topbar" style={{ alignItems: 'center', marginBottom: 0, minWidth: 420 }}>
    <h1 className="serif" style={{ fontSize: 30 }}>{titre}</h1>
    <EdTop {...props} />
  </div>
);

export const ThemeClair = () => <Topbar titre="Réviser" theme="light" onTheme={() => {}} onHub={() => {}} />;

export const ThemeSombre = () => <Topbar titre="Réviser" theme="dark" onTheme={() => {}} onHub={() => {}} />;

export const SansRetourAuHub = () => <Topbar titre="Bibliothèque" theme="light" onTheme={() => {}} />;
