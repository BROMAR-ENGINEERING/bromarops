// ============================================================================
// BROMAR OPS - CORE COMPONENTS
// DataContext, ThemeContext, StorageManager, Sample Data
// ============================================================================

const { useState, useEffect, createContext, useContext } = React;

// Theme Management
const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(getInitialTheme());
    
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };
    
    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Data Context
const DataContext = createContext();

// Storage Manager
const StorageManager = {
    save: (key, data) => {
        localStorage.setItem(key, JSON.stringify(data));
    },
    load: (key, defaultValue = []) => {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    },
    clear: () => {
        localStorage.clear();
    }
};

// NOTE: Sample data initialization is in a separate section - 
// Extract lines 1048-1559 from bromar-ops.html manually for complete sample data

// Data Provider Component
const DataProvider = ({ children }) => {
    const [jobs, setJobs] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [clients, setClients] = useState([]);
    const [equipment, setEquipment] = useState([]);
    const [fleet, setFleet] = useState([]);
    const [maintenanceRequests, setMaintenanceRequests] = useState([]);
    const [maintenanceAudits, setMaintenanceAudits] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [banners, setBanners] = useState([]);
    
    useEffect(() => {
        // initializeSampleData(); // Uncomment when sample data function is added
        loadData();
    }, []);
    
    const loadData = () => {
        setJobs(StorageManager.load('jobs', []));
        setTechnicians(StorageManager.load('technicians', []));
        setPurchaseOrders(StorageManager.load('purchaseOrders', []));
        setClients(StorageManager.load('clients', []));
        setEquipment(StorageManager.load('equipment', []));
        setFleet(StorageManager.load('fleet', []));
        setMaintenanceRequests(StorageManager.load('maintenanceRequests', []));
        setMaintenanceAudits(StorageManager.load('maintenanceAudits', []));
        setQuotes(StorageManager.load('quotes', []));
        setBanners(StorageManager.load('banners', []));
    };
    
    const saveJobs = (newJobs) => {
        StorageManager.save('jobs', newJobs);
        setJobs(newJobs);
    };
    
    const saveTechnicians = (newTechs) => {
        StorageManager.save('technicians', newTechs);
        setTechnicians(newTechs);
    };
    
    const savePurchaseOrders = (newPOs) => {
        StorageManager.save('purchaseOrders', newPOs);
        setPurchaseOrders(newPOs);
    };
    
    const saveClients = (newClients) => {
        StorageManager.save('clients', newClients);
        setClients(newClients);
    };
    
    const saveEquipment = (newEquipment) => {
        StorageManager.save('equipment', newEquipment);
        setEquipment(newEquipment);
    };
    
    const saveFleet = (newFleet) => {
        StorageManager.save('fleet', newFleet);
        setFleet(newFleet);
    };
    
    const saveMaintenanceRequests = (newRequests) => {
        StorageManager.save('maintenanceRequests', newRequests);
        setMaintenanceRequests(newRequests);
    };
    
    const saveMaintenanceAudits = (newAudits) => {
        StorageManager.save('maintenanceAudits', newAudits);
        setMaintenanceAudits(newAudits);
    };
    
    const saveQuotes = (newQuotes) => {
        StorageManager.save('quotes', newQuotes);
        setQuotes(newQuotes);
    };
    
    const saveBanners = (newBanners) => {
        StorageManager.save('banners', newBanners);
        setBanners(newBanners);
    };
    
    return (
        <DataContext.Provider value={{
            jobs, setJobs: saveJobs,
            technicians, setTechnicians: saveTechnicians,
            purchaseOrders, setPurchaseOrders: savePurchaseOrders,
            clients, setClients: saveClients,
            equipment, setEquipment: saveEquipment,
            fleet, setFleet: saveFleet,
            maintenanceRequests, setMaintenanceRequests: saveMaintenanceRequests,
            maintenanceAudits, setMaintenanceAudits: saveMaintenanceAudits,
            quotes, setQuotes: saveQuotes,
            banners, setBanners: saveBanners
        }}>
            {children}
        </DataContext.Provider>
    );
};

// Export to window scope
window.DataContext = DataContext;
window.DataProvider = DataProvider;
window.ThemeContext = ThemeContext;
window.ThemeProvider = ThemeProvider;
window.StorageManager = StorageManager;
