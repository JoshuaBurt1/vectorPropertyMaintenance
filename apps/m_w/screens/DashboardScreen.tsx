// apps/m_w/DashboardScreen.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

import { format } from 'date-fns';

// Free OpenStreetMap Raster Tiles
const osmStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap',
    },
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

interface Job {
  address: string;
  service: string;
  email: string;
  status?: string;
  location?: [number, number];
  lat: number;
  lng: number;
}

export default function DashboardScreen({ worker, routes, onLogout }: any) {
  const [isReady, setIsReady] = useState(false);
  const webViewRef = useRef<WebView>(null); 
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 1. SAFE INITIALIZATION
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true); 
    }, 1000); 
    return () => clearTimeout(timer);
  }, []);

  // 2. DATA NORMALIZATION
  const formattedRoutes = useMemo(() => {
    return (routes || [])
      .map((job: any) => ({
        ...job,
        lat: job.lat || (Array.isArray(job.location) ? job.location[0] : 0),
        lng: job.lng || (Array.isArray(job.location) ? job.location[1] : 0),
      }))
      // Ensure we have coordinates to display
      .filter((job: any) => job.lat !== 0 && job.lng !== 0)
      // CHANGE: Sort by index to ensure the 0, 1, 2 sequence is respected
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  }, [routes]);

  const leafletHTML = useMemo(() => {
  const points = JSON.stringify(formattedRoutes.map((j: any) => [j.lat, j.lng]));

  // Generate markers logic
  const markersJS = formattedRoutes.map((j: any, i: number) => `
    L.circleMarker([${j.lat}, ${j.lng}], {
      radius: ${selectedIndex === i ? 10 : 7},
      fillColor: "${selectedIndex === i ? '#3498db' : '#e74c3c'}",
      color: "#fff",
      weight: 2,
      fillOpacity: 1
    }).addTo(map);
  `).join('');

  return `
    <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            body { margin: 0; padding: 0; }
            #map { height: 100vh; width: 100vw; background: #f8f9fa; }
            .leaflet-control-attribution { display: none; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', { zoomControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            
            var routePoints = ${points};
            if (routePoints.length > 0) {
              var polyline = L.polyline(routePoints, {color: '#3498db', weight: 4, opacity: 0.7}).addTo(map);
              map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
            }
            ${markersJS}
          </script>
        </body>
      </html>
    `;
  }, [formattedRoutes, selectedIndex]);

  // 3. CAMERA BOUNDS CALCULATOR
  const getBounds = useCallback((routesToFit: Job[]) => {
    if (!routesToFit.length) return null;
    let minLng = routesToFit[0].lng, maxLng = routesToFit[0].lng;
    let minLat = routesToFit[0].lat, maxLat = routesToFit[0].lat;
    
    routesToFit.forEach(r => {
      if (r.lng < minLng) minLng = r.lng;
      if (r.lng > maxLng) maxLng = r.lng;
      if (r.lat < minLat) minLat = r.lat;
      if (r.lat > maxLat) maxLat = r.lat;
    });
    
    return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
  }, []);

  // 4. EVENT HANDLERS
  const handleJobPress = (job: any, index: number) => {
    setSelectedIndex(index);
    
    const flyToCode = `
      map.setView([${job.lat}, ${job.lng}], 16, {
        animate: true,
        duration: 1.0
      });
    `;
    webViewRef.current?.injectJavaScript(flyToCode);
  };

  // 5. RENDER GATES
  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text>Loading System Resources...</Text>
        <Text>Establishing GPU Buffer...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Hello,</Text>
          <Text style={styles.workerName}>{worker?.name}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {formattedRoutes.length > 0 ? (
        <View style={{ flex: 1 }}>
          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: leafletHTML }}
              style={styles.map}
              scrollEnabled={false} // Prevents user from scrolling the whole page instead of map
            />
          </View>

          <FlatList
            data={formattedRoutes}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.jobItem,
                  selectedIndex === index && styles.selectedItem
                ]}
                onPress={() => handleJobPress(item, index)}
              >
                <View style={styles.jobInfo}>
                  <Text style={styles.addressText}>{item.address}</Text>
                  <Text style={styles.serviceText}>{item.service}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'completed' ? '#2ecc71' : '#f1c40f' }]}>
                   <Text style={styles.statusText}>{item.status || 'Pending'}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.noRouteText}>No route assigned for today.</Text>
          <Text style={styles.dateText}>{format(new Date(), 'MMMM do, yyyy')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfcfc' },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 20,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  welcomeText: { fontSize: 14, color: '#7f8c8d' },
  workerName: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  logoutBtn: { padding: 8, borderRadius: 8, backgroundColor: '#fff5f5' },
  logoutText: { color: '#e74c3c', fontWeight: '600' },

  mapContainer: { 
    height: Dimensions.get('window').height * 0.4, 
    width: '100%',
    overflow: 'hidden', // Keeps the WebView rounded if you add borderRadius
    backgroundColor: '#eee'
  },
  
  map: { 
    height: Dimensions.get('window').height * 0.4, 
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  
  // Custom MapLibre Marker Styles
  markerBase: {
    height: 18,
    width: 18,
    backgroundColor: '#e74c3c',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerSelected: {
    backgroundColor: '#3498db',
    height: 22,
    width: 22,
    borderRadius: 11,
  },

  listContent: { padding: 15 },
  jobItem: { 
    padding: 18, 
    borderRadius: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  selectedItem: {
    borderColor: '#3498db',
    borderWidth: 2,
    backgroundColor: '#f0f9ff'
  },
  jobInfo: { flex: 1 },
  addressText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  serviceText: { color: '#7f8c8d', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noRouteText: { fontSize: 18, color: '#95a5a6', fontWeight: '500' },
  dateText: { color: '#bdc3c7', marginTop: 8 }
});