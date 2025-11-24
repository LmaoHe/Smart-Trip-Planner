// itineraryInterest.js
// Handles traveler-facing interest and booking functionality

import { auth, db } from './firebase-config.js';
import {
    collection,
    addDoc,
    doc,
    getDoc,
    updateDoc,
    increment,
    query,
    where,
    getDocs,
    deleteDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ===== EXPRESS INTEREST FUNCTION =====
export async function expressInterest(itineraryId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert('Please login to express interest');
            window.location.href = 'login.html';
            return false;
        }

        console.log('📝 Expressing interest for itinerary:', itineraryId);

        // Check if user already expressed interest
        const interestQuery = query(
            collection(db, 'itinerary_interests'),
            where('itineraryId', '==', itineraryId),
            where('userId', '==', user.uid)
        );
        const existingInterest = await getDocs(interestQuery);

        if (!existingInterest.empty) {
            alert('You have already expressed interest in this itinerary');
            return false;
        }

        // Add interest record
        await addDoc(collection(db, 'itinerary_interests'), {
            itineraryId: itineraryId,
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            userEmail: user.email,
            expressedAt: serverTimestamp(),
            status: 'interested'
        });

        console.log('✅ Interest record created');

        // Increment interest count
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        await updateDoc(itineraryRef, {
            interestCount: increment(1)
        });

        console.log('✅ Interest count incremented');

        // Check if threshold reached
        const itineraryDoc = await getDoc(itineraryRef);
        const data = itineraryDoc.data();

        console.log(`📊 Interest count: ${data.interestCount}/${data.interestThreshold}`);

        if (data.interestCount >= data.interestThreshold && data.paymentStatus === 'closed') {
            console.log('🎯 Interest threshold reached! Opening payment window...');
            await updateDoc(itineraryRef, { paymentStatus: 'open' });
        }

        alert('Interest recorded successfully!');
        return true;

    } catch (error) {
        console.error('❌ Error expressing interest:', error);
        alert('Failed to express interest. Please try again.');
        return false;
    }
}

// ===== CHECK IF USER ALREADY EXPRESSED INTEREST =====
export async function checkUserInterest(itineraryId) {
    try {
        const user = auth.currentUser;
        if (!user) return false;

        const interestQuery = query(
            collection(db, 'itinerary_interests'),
            where('itineraryId', '==', itineraryId),
            where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(interestQuery);

        const hasInterest = !snapshot.empty;
        console.log(`🔍 User ${hasInterest ? 'has' : 'has not'} expressed interest`);

        return hasInterest;
    } catch (error) {
        console.error('❌ Error checking user interest:', error);
        return false;
    }
}

// ===== GET INTEREST COUNT FOR ITINERARY =====
export async function getInterestCount(itineraryId) {
    try {
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        const itineraryDoc = await getDoc(itineraryRef);

        if (itineraryDoc.exists()) {
            const data = itineraryDoc.data();
            return {
                count: data.interestCount || 0,
                threshold: data.interestThreshold || 10,
                paymentStatus: data.paymentStatus || 'closed',
                maxBookings: data.maxBookings || 20,
                currentBookings: data.currentBookings || 0,
                paymentDeadline: data.paymentDeadline || null
            };
        }

        console.warn('⚠️ Itinerary not found');
        return null;
    } catch (error) {
        console.error('❌ Error getting interest count:', error);
        return null;
    }
}

// ===== CANCEL INTEREST =====
export async function cancelInterest(itineraryId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert('Please login to cancel interest');
            return false;
        }

        console.log('🗑️ Cancelling interest for itinerary:', itineraryId);

        // Find the interest record
        const interestQuery = query(
            collection(db, 'itinerary_interests'),
            where('itineraryId', '==', itineraryId),
            where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(interestQuery);

        if (snapshot.empty) {
            alert('No interest record found');
            return false;
        }

        // Delete the interest document
        const interestDoc = snapshot.docs[0];
        await deleteDoc(doc(db, 'itinerary_interests', interestDoc.id));

        console.log('✅ Interest record deleted');

        // Decrement interest count
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        await updateDoc(itineraryRef, {
            interestCount: increment(-1)
        });

        console.log('✅ Interest count decremented');

        alert('Interest cancelled successfully');
        return true;

    } catch (error) {
        console.error('❌ Error cancelling interest:', error);
        alert('Failed to cancel interest');
        return false;
    }
}

// ===== GET ALL INTERESTS FOR A USER =====
export async function getUserInterests() {
    try {
        const user = auth.currentUser;
        if (!user) return [];

        const interestQuery = query(
            collection(db, 'itinerary_interests'),
            where('userId', '==', user.uid),
            where('status', '==', 'interested')
        );
        const snapshot = await getDocs(interestQuery);

        const interests = [];
        for (const docSnap of snapshot.docs) {
            const interestData = docSnap.data();

            // Fetch itinerary details
            const itineraryRef = doc(db, 'itineraries', interestData.itineraryId);
            const itineraryDoc = await getDoc(itineraryRef);

            if (itineraryDoc.exists()) {
                interests.push({
                    interestId: docSnap.id,
                    ...interestData,
                    itinerary: itineraryDoc.data()
                });
            }
        }

        console.log(`📋 User has ${interests.length} active interests`);
        return interests;

    } catch (error) {
        console.error('❌ Error getting user interests:', error);
        return [];
    }
}

// ===== CHECK IF PAYMENT IS OPEN =====
export async function isPaymentOpen(itineraryId) {
    try {
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        const itineraryDoc = await getDoc(itineraryRef);

        if (itineraryDoc.exists()) {
            const data = itineraryDoc.data();
            return data.paymentStatus === 'open';
        }

        return false;
    } catch (error) {
        console.error('❌ Error checking payment status:', error);
        return false;
    }
}

// ===== CHECK IF BOOKING IS FULL =====
export async function isBookingFull(itineraryId) {
    try {
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        const itineraryDoc = await getDoc(itineraryRef);

        if (itineraryDoc.exists()) {
            const data = itineraryDoc.data();
            return data.currentBookings >= data.maxBookings;
        }

        return true; // Safe default
    } catch (error) {
        console.error('❌ Error checking booking status:', error);
        return true;
    }
}

// ===== GET INTEREST PROGRESS PERCENTAGE =====
export function getInterestProgress(count, threshold) {
    if (threshold === 0) return 0;
    const progress = (count / threshold) * 100;
    return Math.min(progress, 100); // Cap at 100%
}

// ===== FORMAT DEADLINE DATE =====
export function formatDeadline(deadlineString) {
    if (!deadlineString) return null;

    try {
        const date = new Date(deadlineString);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('❌ Error formatting deadline:', error);
        return deadlineString;
    }
}

// ===== CHECK IF DEADLINE HAS PASSED =====
export function isDeadlinePassed(deadlineString) {
    if (!deadlineString) return false;

    try {
        const deadline = new Date(deadlineString);
        const now = new Date();
        return now > deadline;
    } catch (error) {
        console.error('❌ Error checking deadline:', error);
        return false;
    }
}

