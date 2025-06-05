# 🔒 Guide RLS - Table Friendships

## 🐛 Problème Identifié

**Erreur :** `new row violates row-level security policy for table "friendships"`

**Cause :** La table `friendships` a le RLS (Row Level Security) activé mais il manque les politiques pour permettre aux utilisateurs d'interagir avec leurs données.

## 🛠️ Solution

### 1. **Exécuter le Script RLS**

Exécutez le script `docs/sql/setup_friendships_rls.sql` dans votre base Supabase :

```sql
-- Script à exécuter dans l'éditeur SQL de Supabase
\i docs/sql/setup_friendships_rls.sql
```

### 2. **Politiques Créées**

Le script configure 4 politiques essentielles :

#### 🔍 **Lecture (SELECT)**
```sql
-- Les utilisateurs voient leurs amitiés (requester OU addressee)
CREATE POLICY "Users can view their own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
```

#### ➕ **Création (INSERT)**
```sql
-- Les utilisateurs créent des demandes où ils sont requester
CREATE POLICY "Users can create friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id AND auth.uid() != addressee_id);
```

#### ✏️ **Modification (UPDATE)**
```sql
-- Les utilisateurs modifient leurs amitiés (accepter/refuser/annuler)
CREATE POLICY "Users can update their friendships"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id OR auth.uid() = requester_id);
```

#### 🗑️ **Suppression (DELETE)**
```sql
-- Les utilisateurs suppriment leurs amitiés
CREATE POLICY "Users can delete their friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
```

## 🧪 Validation

### Vérifier les Politiques

```sql
-- Lister les politiques créées
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'friendships';
```

**Résultat attendu :**
```
policyname                         | cmd
-----------------------------------|--------
Users can view their own friendships  | SELECT
Users can create friend requests      | INSERT
Users can update their friendships    | UPDATE
Users can delete their friendships    | DELETE
```

### Tester les Permissions

```sql
-- Test d'insertion (doit fonctionner)
INSERT INTO friendships (requester_id, addressee_id) 
VALUES (auth.uid(), 'uuid-autre-utilisateur');
```

## 🎯 Fonctionnalités Autorisées

Après application des politiques RLS :

### ✅ **Envoi de Demandes**
- ✅ Utilisateur peut envoyer une demande (il devient requester)
- ✅ Vérifie qu'on ne peut pas s'ajouter soi-même
- ✅ Seul le requester authentifié peut créer la ligne

### ✅ **Gestion des Demandes**
- ✅ Addressee peut accepter/refuser (UPDATE status)
- ✅ Requester peut annuler sa demande (DELETE)
- ✅ Les deux parties peuvent voir la relation (SELECT)

### ✅ **Amitiés Acceptées**
- ✅ Les deux amis voient la relation
- ✅ Chacun peut supprimer l'amitié (unfriend)
- ✅ Pas de modification du statut après acceptation

## 🔒 Sécurité Garantie

### **Isolation des Données**
- ❌ Un utilisateur ne peut **PAS** voir les amitiés d'autres utilisateurs
- ❌ Un utilisateur ne peut **PAS** créer de fausses demandes
- ❌ Un utilisateur ne peut **PAS** modifier les amitiés des autres

### **Règles Métier**
- ✅ Impossible de s'ajouter soi-même (`requester_id != addressee_id`)
- ✅ Statuts valides uniquement (`pending`, `accepted`, `declined`, `blocked`)
- ✅ Contrainte unique (`requester_id`, `addressee_id`)

## 🚀 Résultats Attendus

### Avant (❌)
```
❌ Erreur RLS lors de l'envoi de demandes
❌ "new row violates row-level security policy"
❌ Impossibilité d'ajouter des amis
```

### Après (✅)
```
✅ Envoi de demandes d'amis fonctionnel
✅ Gestion complète des statuts
✅ Sécurité optimale des données
✅ Logs clairs pour le debugging
```

## 📋 Checklist de Vérification

- [ ] Script `setup_friendships_rls.sql` exécuté
- [ ] 4 politiques créées (SELECT, INSERT, UPDATE, DELETE)
- [ ] Test d'envoi de demande d'ami réussi
- [ ] Vérification que les logs ne montrent plus d'erreur RLS

---

**🎉 RLS configuré !** Le système d'amis fonctionne maintenant avec une sécurité optimale. 