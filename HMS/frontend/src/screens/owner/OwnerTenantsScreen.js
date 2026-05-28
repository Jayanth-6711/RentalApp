import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Linking,
  Platform,
  TextInput,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import BASE_URL, { fetchWithAuth } from '../../config/Api';

const { width } = Dimensions.get('window');

const FILTERS = [
  { key: 'All', label: 'All', icon: 'people-outline', color: '#7C3AED' },
  { key: 'Hostel', label: 'Hostel', icon: 'bed-outline', color: '#2563EB' },
  { key: 'Apartment', label: 'Apartment', icon: 'home-outline', color: '#059669' },
  { key: 'Commercial', label: 'Commercial', icon: 'business-outline', color: '#D97706' },
];

export default function OwnerTenantsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  useFocusEffect(
    useCallback(() => {
      fetchTenants();
    }, [])
  );

  const fetchTenants = async () => {
    try {
      const phone = await AsyncStorage.getItem('ownerPhone');
      if (!phone) return;
      const trimmedPhone = phone.trim();

      const [hostelRes, aptRes, commRes] = await Promise.all([
        fetchWithAuth(`${BASE_URL}/api/getbeds/${encodeURIComponent(trimmedPhone)}/`).catch(() => null),
        fetchWithAuth(`${BASE_URL}/api/getapartmentbeds/${encodeURIComponent(trimmedPhone)}/`).catch(() => null),
        fetchWithAuth(`${BASE_URL}/api/getcommercialbeds/${encodeURIComponent(trimmedPhone)}/`).catch(() => null),
      ]);

      const [hostelData, aptData, commData] = await Promise.all([
        hostelRes ? hostelRes.json().catch(() => ({})) : {},
        aptRes ? aptRes.json().catch(() => ({})) : {},
        commRes ? commRes.json().catch(() => ({})) : {},
      ]);

      let allTenants = [];
      if (hostelData.data) {
        allTenants = [
          ...allTenants,
          ...hostelData.data.map((t) => ({
            ...t,
            type: 'Hostel',
            location: `Floor ${t.floor || 0} • Room ${t.roomno || '-'}`,
            bedInfo: `Bed ${t.bed || '-'}`,
          })),
        ];
      }
      if (aptData.data) {
        allTenants = [
          ...allTenants,
          ...aptData.data.map((t) => ({
            ...t,
            type: 'Apartment',
            location: `Floor ${t.floor || 0} • Flat ${t.flatno || '-'}`,
            bedInfo: null,
          })),
        ];
      }
      if (commData.data) {
        allTenants = [
          ...allTenants,
          ...commData.data.map((t) => ({
            ...t,
            type: 'Commercial',
            location: `Floor ${t.floor || 0} • Section ${t.sectionNo || '-'}`,
            bedInfo: null,
          })),
        ];
      }

      setTenants(allTenants);
    } catch (error) {
      console.log('Error fetching tenants:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTenants();
  }, []);

  // Filter and search logic
  const filteredTenants = tenants.filter((t) => {
    const matchesFilter = activeFilter === 'All' || t.type === activeFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      (t.name && t.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.phone && t.phone.includes(searchQuery));
    return matchesFilter && matchesSearch;
  });

  // Counts by type
  const counts = {
    All: tenants.length,
    Hostel: tenants.filter((t) => t.type === 'Hostel').length,
    Apartment: tenants.filter((t) => t.type === 'Apartment').length,
    Commercial: tenants.filter((t) => t.type === 'Commercial').length,
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Hostel':
        return '#2563EB';
      case 'Apartment':
        return '#059669';
      case 'Commercial':
        return '#D97706';
      default:
        return '#7C3AED';
    }
  };

  const getTypeBg = (type) => {
    switch (type) {
      case 'Hostel':
        return '#EFF6FF';
      case 'Apartment':
        return '#ECFDF5';
      case 'Commercial':
        return '#FFFBEB';
      default:
        return '#F5F3FF';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Hostel':
        return 'bed-outline';
      case 'Apartment':
        return 'home-outline';
      case 'Commercial':
        return 'business-outline';
      default:
        return 'people-outline';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderTenant = ({ item, index }) => {
    const typeColor = getTypeColor(item.type);
    const typeBg = getTypeBg(item.type);
    const stayType = item.type?.toLowerCase();

    // Map properties similar to OwnerHomeScreen
    let roomLabel = '';
    if (stayType === 'hostel') roomLabel = item.roomno || '-';
    else if (stayType === 'apartment') roomLabel = item.flatno || '-';
    else if (stayType === 'commercial') roomLabel = item.sectionNo || '-';
    
    let displayLocation = `Floor ${item.floor || 0} • ${stayType === "hostel" ? `Room ${roomLabel}` : stayType === "apartment" ? `Flat ${roomLabel}` : `Section ${roomLabel}`}`;

    return (
      <View key={`${item.id}-${index}`} style={styles.listTenantCard}>
        <View style={styles.listTenantTop}>
          <View style={styles.listAvatar}>
            <Text style={styles.listAvatarText}>
              {(item.name || "T").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.listTenantName}>{item.name}</Text>
            <Text style={styles.listTenantDetails}>
              {displayLocation}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              const tel = `tel:${item.phone || item.mobile || item.contact}`;
              Linking.openURL(tel).catch(() => { });
            }}
            style={styles.listCallBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={18} color="#22C55E" />
          </TouchableOpacity>
        </View>

        <View style={styles.listSeparator} />

        <View style={styles.listTenantBottom}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {!!item.rent && (
              <View style={styles.listMetaPill}>
                <Ionicons name="cash" size={14} color="#6C2BD9" />
                <Text style={styles.listMetaText}>₹{item.rent}</Text>
              </View>
            )}
            {!!item.bed && stayType === "hostel" && (
              <View style={styles.listMetaPill}>
                <Ionicons name="bed" size={14} color="#8B5CF6" />
                <Text style={styles.listMetaText}>Bed {item.bed}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                navigation.navigate('OwnerEditTenantScreen', {
                  tenant: item,
                  stayType: stayType,
                  totalBeds: item.bed || 1,
                });
              }}
              style={[styles.listActionBtn, { backgroundColor: "rgba(108, 43, 217, 0.08)" }]}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={16} color="#6C2BD9" />
            </TouchableOpacity>

          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* Header */}
      <LinearGradient
        colors={['#7C3AED', '#9333EA', '#A855F7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Tenants</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{tenants.length}</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.key;
            return (
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  isActive && {
                    backgroundColor: item.color,
                    shadowColor: item.color,
                    shadowOpacity: 0.3,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 8,
                    elevation: 4,
                  },
                ]}
                onPress={() => setActiveFilter(item.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={isActive ? '#FFF' : item.color}
                />
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? '#FFF' : '#4B5563' },
                  ]}
                >
                  {item.label}
                </Text>
                <View
                  style={[
                    styles.filterCount,
                    {
                      backgroundColor: isActive
                        ? 'rgba(255,255,255,0.25)'
                        : '#F3F4F6',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      { color: isActive ? '#FFF' : '#6B7280' },
                    ]}
                  >
                    {counts[item.key]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Tenants List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Loading tenants...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTenants}
          renderItem={renderTenant}
          keyExtractor={(item, index) =>
            `${item.type}-${item.id || index}-${index}`
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#7C3AED']}
              tintColor="#7C3AED"
            />
          }
          ListHeaderComponent={
            filteredTenants.length > 0 ? (
              <Text style={styles.resultCount}>
                {filteredTenants.length}{' '}
                {filteredTenants.length === 1 ? 'tenant' : 'tenants'} found
                {activeFilter !== 'All' ? ` in ${activeFilter}` : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="people-outline" size={56} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No Tenants Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : activeFilter !== 'All'
                  ? `No tenants in ${activeFilter} properties`
                  : 'Add tenants from the Home screen to see them here'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 8,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  headerBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 10,
    fontWeight: '500',
  },
  filterContainer: {
    backgroundColor: '#FFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  filterList: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterCount: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    padding: 14,
    paddingBottom: 30,
  },
  resultCount: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 10,
    paddingLeft: 4,
  },
  listTenantCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  listTenantTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  listAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6C2BD9",
    justifyContent: "center",
    alignItems: "center",
  },
  listAvatarText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
  listTenantName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  listTenantDetails: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginTop: 2,
  },
  listCallBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  listSeparator: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 12,
  },
  listTenantBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  listMetaText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    marginLeft: 4,
  },
  listActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
