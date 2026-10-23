import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

export default function App() {
  const [tache, setTache] = useState('');
  const [taches, setTaches] = useState([]);

  const ajouter = () => {
    if (tache.trim() === '') return;
    setTaches([...taches, { id: Date.now().toString(), texte: tache, fait: false }]);
    setTache('');
  };

  const basculer = (id) => {
    setTaches(taches.map(t => (t.id === id ? { ...t, fait: !t.fait } : t)));
  };

  const supprimer = (id) => {
    setTaches(taches.filter(t => t.id !== id));
  };

  return (
    <View style={styles.conteneur}>
      <Text style={styles.titre}>Ma liste de tâches</Text>
      <View style={styles.ligne}>
        <TextInput
          style={styles.champ}
          placeholder="Nouvelle tâche"
          value={tache}
          onChangeText={setTache}
        />
        <Button title="Ajouter" onPress={ajouter} />
      </View>
      <FlatList
        data={taches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.element}>
            <TouchableOpacity onPress={() => basculer(item.id)} style={{ flex: 1 }}>
              <Text style={[styles.texte, item.fait && styles.fait]}>
                {item.fait ? '✓ ' : '○ '}{item.texte}
              </Text>
            </TouchableOpacity>
            <Button title="Supprimer" onPress={() => supprimer(item.id)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: '#fff' },
  titre: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  ligne: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  champ: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginRight: 8 },
  element: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  texte: { fontSize: 16 },
  fait: { textDecorationLine: 'line-through', color: '#888' },
});
