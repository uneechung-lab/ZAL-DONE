import { Client, Databases, Account, ID, Query } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || '';
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID || '';
const schedulesCollectionId = import.meta.env.VITE_APPWRITE_SCHEDULES_COLLECTION_ID || '';
const messagesCollectionId = import.meta.env.VITE_APPWRITE_MESSAGES_COLLECTION_ID || '';

export const isConfigured = !!(endpoint && projectId && databaseId && schedulesCollectionId && messagesCollectionId);

const client = new Client();
if (isConfigured) {
  client.setEndpoint(endpoint).setProject(projectId);
}
const databases = new Databases(client);
const account = new Account(client);

export const appwriteService = {
  isConfigured,

  async register(email, password, name) {
    if (!isConfigured) return null;
    try {
      // Create user account
      await account.create(ID.unique(), email, password, name);
      // Automatically create a session for the user after registration
      return await this.login(email, password);
    } catch (e) {
      console.error('Appwrite failed to register user', e);
      throw e;
    }
  },

  async login(email, password) {
    if (!isConfigured) return null;
    try {
      return await account.createEmailPasswordSession(email, password);
    } catch (e) {
      console.error('Appwrite failed to login user', e);
      throw e;
    }
  },

  async logout() {
    if (!isConfigured) return null;
    try {
      await account.deleteSession('current');
      return true;
    } catch (e) {
      console.error('Appwrite failed to logout user', e);
      return false;
    }
  },

  async getCurrentUser() {
    if (!isConfigured) return null;
    try {
      return await account.get();
    } catch (e) {
      // Silently catch since it's expected when user is not logged in
      return null;
    }
  },

  async updateName(name) {
    if (!isConfigured) return null;
    try {
      return await account.updateName(name);
    } catch (e) {
      console.error('Appwrite failed to update user name', e);
      throw e;
    }
  },
  
  async getSchedules() {
    if (!isConfigured) return null;
    try {
      const response = await databases.listDocuments(databaseId, schedulesCollectionId, [Query.limit(100)]);
      return response.documents.map(doc => ({
        id: doc.$id,
        memberId: doc.memberId,
        memberIds: JSON.parse(doc.memberIds || '[]'),
        title: doc.title,
        startHour: doc.startHour,
        endHour: doc.endHour,
        color: doc.color,
        status: doc.status,
        date: doc.date,
        requesterId: doc.requesterId,
        description: doc.description || '',
      }));
    } catch (e) {
      console.error('Appwrite failed to get schedules', e);
      return null;
    }
  },

  async createSchedule(schedule) {
    if (!isConfigured) return null;
    try {
      const data = {
        memberId: schedule.memberId,
        memberIds: JSON.stringify(schedule.memberIds || []),
        title: schedule.title,
        startHour: schedule.startHour,
        endHour: schedule.endHour,
        color: schedule.color,
        status: schedule.status,
        date: schedule.date,
        requesterId: schedule.requesterId || '',
        description: schedule.description || '',
      };
      const response = await databases.createDocument(databaseId, schedulesCollectionId, ID.unique(), data, ['read("any")', 'write("any")']);
      return { ...schedule, id: response.$id };
    } catch (e) {
      console.error('Appwrite failed to create schedule', e);
      return null;
    }
  },

  async updateSchedule(id, schedule) {
    if (!isConfigured) return null;
    try {
      const data = {
        memberId: schedule.memberId,
        memberIds: JSON.stringify(schedule.memberIds || []),
        title: schedule.title,
        startHour: schedule.startHour,
        endHour: schedule.endHour,
        color: schedule.color,
        status: schedule.status,
        date: schedule.date,
        requesterId: schedule.requesterId || '',
        description: schedule.description || '',
      };
      await databases.updateDocument(databaseId, schedulesCollectionId, id, data);
      return true;
    } catch (e) {
      console.error('Appwrite failed to update schedule', e);
      return false;
    }
  },

  async deleteSchedule(id) {
    if (!isConfigured) return null;
    try {
      await databases.deleteDocument(databaseId, schedulesCollectionId, id);
      return true;
    } catch (e) {
      console.error('Appwrite failed to delete schedule', e);
      return false;
    }
  },

  async clearSchedules() {
    if (!isConfigured) return null;
    try {
      const response = await databases.listDocuments(databaseId, schedulesCollectionId, [Query.limit(100)]);
      for (const doc of response.documents) {
        await databases.deleteDocument(databaseId, schedulesCollectionId, doc.$id);
      }
      return true;
    } catch (e) {
      console.error('Appwrite failed to clear schedules', e);
      return false;
    }
  },

  async getMessages() {
    if (!isConfigured) return null;
    try {
      // Appwrite queries default order is undefined. Sort ascending by creation time.
      const response = await databases.listDocuments(databaseId, messagesCollectionId, [Query.limit(100), Query.orderAsc('$createdAt')]);
      return response.documents.map(doc => ({
        id: doc.$id,
        from: doc.from,
        text: doc.text,
        time: doc.time,
      }));
    } catch (e) {
      console.error('Appwrite failed to get messages', e);
      return null;
    }
  },

  async createMessage(msg) {
    if (!isConfigured) return null;
    try {
      const data = {
        from: msg.from,
        text: msg.text,
        time: msg.time,
      };
      const response = await databases.createDocument(databaseId, messagesCollectionId, ID.unique(), data, ['read("any")', 'write("any")']);
      return { ...msg, id: response.$id };
    } catch (e) {
      console.error('Appwrite failed to create message', e);
      return null;
    }
  },

  async clearMessages() {
    if (!isConfigured) return null;
    try {
      const response = await databases.listDocuments(databaseId, messagesCollectionId, [Query.limit(100)]);
      for (const doc of response.documents) {
        await databases.deleteDocument(databaseId, messagesCollectionId, doc.$id);
      }
      return true;
    } catch (e) {
      console.error('Appwrite failed to clear messages', e);
      return false;
    }
  }
};
