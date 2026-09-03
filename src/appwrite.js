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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const appwriteService = {
  isConfigured,

  async register(email, password, name, prefs = {}) {
    if (!isConfigured) return null;
    try {
      try {
        await account.deleteSession('current');
      } catch (_) {}

      // Create user account
      await account.create(ID.unique(), email, password, name);
      // Automatically create a session for the user after registration
      const session = await this.login(email, password);
      if (prefs && Object.keys(prefs).length > 0) {
        try {
          await account.updatePrefs(prefs);
        } catch (prefErr) {
          console.warn('Appwrite failed to update user preferences:', prefErr);
        }
      }
      return session;
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
      if (
        e?.type === 'user_session_already_exists' ||
        (e?.message && (e.message.includes('session is active') || e.message.includes('Creation of a session is prohibited')))
      ) {
        try {
          try {
            await account.deleteSession('current');
          } catch (_) {
            await account.deleteSessions();
          }
          return await account.createEmailPasswordSession(email, password);
        } catch (retryErr) {
          console.error('Appwrite retry login failed', retryErr);
          throw retryErr;
        }
      }
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
      return response.documents.filter(doc => doc.status !== 'deleted' && doc.title !== '__DELETED__').map(doc => {
        let year = doc.year || null;
        let month = doc.month || null;
        let cleanDesc = doc.description || '';
        let reqMeta = {};
        if (cleanDesc) {
          const ymMatch = cleanDesc.match(/\[YM:(\d{4})\.(\d{1,2})\]/);
          if (ymMatch) {
            year = parseInt(ymMatch[1]);
            month = parseInt(ymMatch[2]);
          }
          const metaMatch = cleanDesc.match(/\[REQ_META:(.*?)\]/);
          if (metaMatch) {
            try {
              reqMeta = JSON.parse(decodeURIComponent(metaMatch[1]));
            } catch (_) {}
          }
        }
        let parsedMemberIds = [doc.memberId];
        if (doc.memberIds) {
          try {
            parsedMemberIds = typeof doc.memberIds === 'string' ? JSON.parse(doc.memberIds) : doc.memberIds;
          } catch (e) {
            parsedMemberIds = [doc.memberId];
          }
        }
        return {
          id: doc.$id,
          year,
          month,
          date: doc.date,
          title: doc.title,
          memberId: doc.memberId,
          memberIds: parsedMemberIds,
          startHour: doc.startHour,
          endHour: doc.endHour,
          color: doc.color,
          description: (doc.description || '').replace(/\[REQ_META:.*?\]/g, '').trim(),
          status: doc.status || 'active',
          requesterId: doc.requesterId || null,
          createdAt: doc.$createdAt || null,
          requestedMemberIds: reqMeta.requestedMemberIds || null,
          assigneeRequesterId: reqMeta.assigneeRequesterId || null,
          assigneeRequestStatus: reqMeta.assigneeRequestStatus || null,
          history: reqMeta.history || null
        };
      });
    } catch (e) {
      console.error('Appwrite failed to get schedules', e);
      return null;
    }
  },

  async createSchedule(schedule) {
    if (!isConfigured) return null;
    try {
      let desc = schedule.description || '';
      if (schedule.year && schedule.month && !desc.includes('[YM:')) {
        desc = `[YM:${schedule.year}.${schedule.month}] ${desc}`.trim();
      }
      if (schedule.assigneeRequestStatus || schedule.requestedMemberIds || schedule.history) {
        const metaObj = {
          assigneeRequestStatus: schedule.assigneeRequestStatus,
          requestedMemberIds: schedule.requestedMemberIds,
          assigneeRequesterId: schedule.assigneeRequesterId,
          history: schedule.history
        };
        const encodedMeta = `[REQ_META:${encodeURIComponent(JSON.stringify(metaObj))}]`;
        desc = desc.replace(/\[REQ_META:.*?\]/g, '').trim() + ' ' + encodedMeta;
      }
      const data = {
        date: schedule.date,
        title: schedule.title,
        memberId: schedule.memberId,
        memberIds: JSON.stringify(schedule.memberIds || [schedule.memberId]),
        startHour: schedule.startHour,
        endHour: schedule.endHour,
        color: schedule.color,
        description: desc,
        status: schedule.status || 'active',
        requesterId: schedule.requesterId || '',
      };
      const response = await databases.createDocument(databaseId, schedulesCollectionId, ID.unique(), data, ['read("any")', 'write("any")']);
      return { ...schedule, id: response.$id, createdAt: response.$createdAt || schedule.createdAt || new Date().toISOString() };
    } catch (e) {
      console.error('Appwrite failed to create schedule', e);
      return null;
    }
  },

  async updateSchedule(id, updates) {
    if (!isConfigured) return null;
    try {
      let docId = id || updates.$id || updates.id;

      let desc = updates.description !== undefined ? updates.description : (updates.desc !== undefined ? updates.desc : '');
      if (updates.year && updates.month && !desc.includes('[YM:')) {
        desc = `[YM:${updates.year}.${updates.month}] ${desc}`.trim();
      }
      if (updates.assigneeRequestStatus !== undefined || updates.requestedMemberIds !== undefined || updates.history !== undefined) {
        const metaObj = {
          assigneeRequestStatus: updates.assigneeRequestStatus,
          requestedMemberIds: updates.requestedMemberIds,
          assigneeRequesterId: updates.assigneeRequesterId,
          history: updates.history
        };
        const encodedMeta = `[REQ_META:${encodeURIComponent(JSON.stringify(metaObj))}]`;
        desc = desc.replace(/\[REQ_META:.*?\]/g, '').trim() + ' ' + encodedMeta;
      }

      // Appwrite schedules schema only has these attributes:
      const schemaFields = ['title', 'date', 'memberId', 'memberIds', 'startHour', 'endHour', 'color', 'description', 'status', 'requesterId'];
      const cleanData = {};
      schemaFields.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'memberIds' && Array.isArray(updates[field])) {
            cleanData[field] = JSON.stringify(updates[field]);
          } else {
            cleanData[field] = updates[field];
          }
        }
      });
      if (desc) {
        cleanData.description = desc;
      }

      let response = null;
      // 1) Try direct update if docId looks like an Appwrite ID (string without purely digits)
      if (docId && typeof docId === 'string' && isNaN(Number(docId))) {
        try {
          response = await databases.updateDocument(databaseId, schedulesCollectionId, docId, cleanData);
          if (response) return response;
        } catch (err) {
          console.warn('Direct updateDocument failed for docId:', docId, err);
        }
      }

      // 2) Safe Fallback: fetch document list without Query.equal (avoids missing index errors) and find matching document
      const targetTitle = updates.title;
      const targetDate = updates.date;
      const targetStartHour = updates.startHour;

      try {
        const list = await databases.listDocuments(databaseId, schedulesCollectionId, [
          Query.limit(100)
        ]);
        const match = list.documents.find(d => 
          d.title === targetTitle && 
          (!targetDate || d.date === targetDate) && 
          (!targetStartHour || d.startHour === targetStartHour)
        ) || list.documents.find(d => d.title === targetTitle);

        if (match) {
          response = await databases.updateDocument(databaseId, schedulesCollectionId, match.$id, cleanData);
          return response;
        }
      } catch (listErr) {
        console.error('Fallback listDocuments failed:', listErr);
      }

      return response;
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

    async setGlobalResetMarker() {
    if (!isConfigured) return null;
    try {
      const timestampStr = Date.now().toString();
      const data = {
        memberId: 'all',
        memberIds: JSON.stringify(['all']),
        title: '__RESET__',
        startHour: 0,
        endHour: 0,
        color: 'gray',
        status: 'reset',
        date: 1,
        requesterId: 'system',
        description: timestampStr
      };
      await databases.createDocument(databaseId, schedulesCollectionId, ID.unique(), data, ['read("any")', 'write("any")']);
      return timestampStr;
    } catch (e) {
      console.error('Appwrite failed to set global reset marker', e);
      return null;
    }
  },

  async clearSchedules() {
    if (!isConfigured) return null;
    try {
      let hasMore = true;
      let iterations = 0;
      while (hasMore && iterations < 10) {
        iterations++;
        const response = await databases.listDocuments(databaseId, schedulesCollectionId, [Query.limit(100)]);
        if (!response.documents || response.documents.length === 0) {
          hasMore = false;
          break;
        }

        const validDocs = response.documents.filter(d => d.status !== 'deleted' && d.title !== '__DELETED__');
        if (validDocs.length === 0) {
          hasMore = false;
          break;
        }

        for (const doc of validDocs) {
          try {
            await databases.deleteDocument(databaseId, schedulesCollectionId, doc.$id);
          } catch (err) {
            console.warn('Could not delete schedule document, attempting status update:', doc.$id, err);
            try {
              await databases.updateDocument(databaseId, schedulesCollectionId, doc.$id, {
                status: 'deleted',
                title: '__DELETED__'
              });
            } catch (uErr) {
              console.error('Failed to update schedule doc as deleted:', doc.$id, uErr);
            }
          }
        }
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
      return response.documents.filter(doc => doc.from !== 'deleted' && doc.text !== '__DELETED__').map(doc => ({
        id: doc.$id,
        from: doc.from,
        text: doc.text,
        time: doc.time,
        createdAt: doc.$createdAt || null
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
      return { ...msg, id: response.$id, createdAt: response.$createdAt || msg.createdAt || new Date().toISOString() };
    } catch (e) {
      console.error('Appwrite failed to create message', e);
      return null;
    }
  },

  async clearMessages() {
    if (!isConfigured) return null;
    try {
      let hasMore = true;
      let iterations = 0;
      while (hasMore && iterations < 10) {
        iterations++;
        const response = await databases.listDocuments(databaseId, messagesCollectionId, [Query.limit(100)]);
        if (!response.documents || response.documents.length === 0) {
          hasMore = false;
          break;
        }

        const validDocs = response.documents.filter(d => d.from !== 'deleted' && d.text !== '__DELETED__');
        if (validDocs.length === 0) {
          hasMore = false;
          break;
        }

        for (const doc of validDocs) {
          try {
            await databases.deleteDocument(databaseId, messagesCollectionId, doc.$id);
          } catch (err) {
            console.warn('Could not delete message document, attempting text update:', doc.$id, err);
            try {
              await databases.updateDocument(databaseId, messagesCollectionId, doc.$id, {
                from: 'deleted',
                text: '__DELETED__'
              });
            } catch (uErr) {
              console.error('Failed to update message doc as deleted:', doc.$id, uErr);
            }
          }
        }
      }
      return true;
    } catch (e) {
      console.error('Appwrite failed to clear messages', e);
      return false;
    }
  }
};
