import { NextRequest, NextResponse } from 'next/server';
import { extractCampusData } from '@/lib/parsers/matrufsc-parser';

// Load the entire data once at the server level
// This way we only do a single import, not on every request
let fullMatrufscData: any = null;

/**
 * API Route to fetch MatrUFSC data for a specific campus
 * This prevents the client from having to download the entire dataset
 */
export async function GET(request: NextRequest) {
  try {
    // Get the campus parameter from the query string (default to FLO)
    const { searchParams } = new URL(request.url);
    const campus = searchParams.get('campus') || 'FLO';
    
    // Load the data if not already loaded
    if (!fullMatrufscData) {
      try {
        const { default: data } = await import('@/matrufsc-scraper/src/20251.json');
        fullMatrufscData = data;
        console.log('MatrUFSC data loaded on server');
      } catch (error) {
        console.error('Error loading MatrUFSC data:', error);
        return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
      }
    }
    
    // Extract only the requested campus data
    const campusData = extractCampusData(fullMatrufscData, campus);
    
    if (!campusData) {
      return NextResponse.json({ error: `Campus '${campus}' not found` }, { status: 404 });
    }
    
    // Return just the requested campus data
    return NextResponse.json(campusData);
  } catch (error) {
    console.error('Error in MatrUFSC API route:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 