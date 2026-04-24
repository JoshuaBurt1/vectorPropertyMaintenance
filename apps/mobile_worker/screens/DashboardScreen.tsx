//mobile_worker/screens/DashboardScreen.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export default function DashboardScreen({ worker, routes, navigation, onLogout }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hello, {worker.name}</Text>
        <TouchableOpacity onPress={onLogout}><Text style={{color: 'red'}}>Logout</Text></TouchableOpacity>
      </View>

      {routes.length > 0 ? (
        <>
          <MapView 
            style={styles.map}
            initialRegion={{
              latitude: routes[0].lat || 43.6532,
              longitude: routes[0].lng || -79.3832,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
          >
            {routes.map((job: any, index: number) => (
              <Marker 
                key={index}
                coordinate={{ latitude: job.lat, longitude: job.lng }}
                title={job.address}
              />
            ))}
          </MapView>
          
          <FlatList
            data={routes}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.jobItem}
                onPress={() => navigation.navigate('Camera', { job: item })}
              >
                <Text style={styles.addressText}>{item.address}</Text>
                <Text style={styles.statusText}>Tap to start photos</Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <View style={styles.centered}><Text>No tasks scheduled for today.</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: 'bold' },
  map: { height: '40%', width: '100%' },
  jobItem: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  addressText: { fontSize: 16, fontWeight: '600' },
  statusText: { color: '#666', marginTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});