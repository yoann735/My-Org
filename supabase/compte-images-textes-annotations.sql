-- ============================================================================
-- MedRevise — IMAGES FLOTTANTES DES DOCUMENTS ET TEXTES DE BOÎTES (LECTURE SEULE)
-- docs/compte-rendu-images-surlignage-json.md — préparé le 10/10/2026, NON APPLIQUÉ.
--
-- Aucune migration de schéma n'est nécessaire : les nouveaux champs (convertieEnFlux,
-- textOriginal, contentOriginal, textAlt, contentAlt, displayVersion, et l'attribut
-- deAnnotation des images du flux) sont AJOUTÉS dans la colonne `data` (jsonb) des
-- enregistrements existants de medrevise_records ; medrevise_push les recopie tels quels.
--
-- Ce script ne fait QUE LIRE (transaction `read only`, terminée par `rollback`) :
--   1. combien d'images flottantes sont posées dans des DOCUMENTS (à convertir à leur
--      première ouverture), et combien le sont déjà (convertieEnFlux) ;
--   2. combien de boîtes de texte existent, combien ont un id, combien ont déjà deux versions.
-- À exécuter : Supabase → My Org → SQL Editor → New query → coller → Run.
-- ============================================================================
begin;
set transaction read only;

-- documents créés dans l'app : fiche avec docNotes, sans PDF ni HTML
with documents as (
  select record_id as fiche_id
  from public.medrevise_records
  where store = 'fiches' and not deleted
    and coalesce((data->>'docNotes')::boolean, false)
    and coalesce(data->>'pdfId', '') = '' and coalesce(data->>'htmlId', '') = ''
)
select
  count(*) filter (where a.data->>'convertieEnFlux' is null)     as images_flottantes_a_convertir,
  count(*) filter (where a.data->>'convertieEnFlux' is not null) as images_deja_converties,
  count(distinct a.data->>'ficheId')                             as documents_concernes
from public.medrevise_records a
join documents d on d.fiche_id = a.data->>'ficheId'
where a.store = 'annotations' and not a.deleted and a.data->>'kind' = 'image';

-- boîtes de texte (boîte « libre » et texte libre) : ids et versions
select
  count(*)                                                      as boites_de_texte,
  count(*) filter (where coalesce(a.data->>'id', '') <> '')     as boites_avec_id,
  count(*) filter (where a.data->>'id' = a.record_id)           as id_identique_a_la_cle,
  count(*) filter (where a.data ? 'textAlt')                    as boites_avec_version_ia,
  count(*) filter (where a.data->>'displayVersion' = 'alt')     as affichees_en_version_ia
from public.medrevise_records a
where a.store = 'annotations' and not a.deleted and a.data->>'kind' in ('libre', 'texte');

rollback;
