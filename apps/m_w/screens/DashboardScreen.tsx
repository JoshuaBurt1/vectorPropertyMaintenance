// m_w/screens/DashboardScreen.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export default function DashboardScreen({ worker, routes, navigation, onLogout }: any) {
  // Addition: Data mapping to handle the Firestore 'location' array format
  // This ensures jobs are rendered even if passed as raw Firestore objects
  const formattedRoutes = (routes || []).map((job: any) => ({
    ...job,
    // Extracts coordinates from 'location' array (0: lat, 1: lng) if standard keys are missing
    lat: job.lat || (Array.isArray(job.location) ? job.location[0] : null),
    lng: job.lng || (Array.isArray(job.location) ? job.location[1] : null),
  })).filter((job: any) => job.lat !== null && job.lng !== null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hello, {worker.name}</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={{ color: 'red' }}>Logout</Text>
        </TouchableOpacity>
      </View>

      {formattedRoutes.length > 0 ? (
        <>
          <MapView
            style={styles.map}
            initialRegion={{
              // Centers the map on the first job location
              latitude: formattedRoutes[0].lat,
              longitude: formattedRoutes[0].lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            {formattedRoutes.map((job: any, index: number) => (
              <Marker
                key={index}
                coordinate={{ latitude: job.lat, longitude: job.lng }}
                title={job.address}
                description={job.service}
              />
            ))}

            {/* Addition: Polyline to visualize the optimized route path */}
            <Polyline
              coordinates={formattedRoutes.map((j: any) => ({
                latitude: j.lat,
                longitude: j.lng,
              }))}
              strokeColor="#4A90E2"
              strokeWidth={3}
            />
          </MapView>

          <FlatList
            data={formattedRoutes}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.jobItem}
                onPress={() => navigation.navigate('Camera', { job: item })}
              >
                <View style={styles.jobDetails}>
                  <Text style={styles.addressText}>{item.address}</Text>
                  <Text style={styles.serviceText}>{item.service}</Text>
                </View>
                <Text style={styles.statusText}>Tap to start photos</Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <View style={styles.centered}>
          <Text>No tasks scheduled for today.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: 'bold' },
  map: { height: '40%', width: '100%' },
  jobItem: { 
    padding: 15, 
    borderBottomWidth: 1, 
    borderColor: '#eee', 
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  jobDetails: { flex: 1 },
  addressText: { fontSize: 16, fontWeight: '600' },
  serviceText: { color: '#666', marginTop: 2 },
  statusText: { color: '#007AFF', fontWeight: '500' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});