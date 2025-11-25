// app/api/shop/route.js
import { NextResponse } from 'next/server';
import { SHOP_ITEMS } from '@/lib/redis';

// GET - List all shop items
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    
    let items = SHOP_ITEMS;
    
    if (type) {
      items = items.filter(item => item.type === type);
    }
    
    // Group by type
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = [];
      }
      acc[item.type].push(item);
      return acc;
    }, {});
    
    return NextResponse.json({
      success: true,
      data: {
        items,
        grouped,
        totalItems: SHOP_ITEMS.length,
      },
    });
    
  } catch (error) {
    console.error('Shop list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
