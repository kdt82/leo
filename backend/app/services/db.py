"""
Database service for Leonardo Bulk Studio.
Supports both SQLite (local development) and PostgreSQL (production).
"""
import os
import csv
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.core.config import settings

# PostgreSQL support
if settings.USE_POSTGRES:
    import asyncpg
    from asyncpg import Pool
    
    _pool: Optional[Pool] = None
    
    async def get_pool() -> Pool:
        global _pool
        if _pool is None:
            _pool = await asyncpg.create_pool(settings.DATABASE_URL)
        return _pool
    
    async def close_pool():
        global _pool
        if _pool:
            await _pool.close()
            _pool = None

# SQLite support (local development)
else:
    import sqlite3
    DB_PATH = os.path.join(settings.OUTPUT_DIR, "history.db")


# ============================================================
# INITIALIZATION
# ============================================================

async def init_db():
    """Initialize database with all required tables."""
    if settings.USE_POSTGRES:
        await _init_postgres()
    else:
        _init_sqlite()


async def _init_postgres():
    """Initialize PostgreSQL database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Create generations table
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                batch_id TEXT,
                prompt TEXT,
                prompt_number INTEGER,
                model_id TEXT,
                status TEXT,
                image_url TEXT,
                local_path TEXT,
                width INTEGER,
                height INTEGER,
                seed BIGINT,
                tag TEXT,
                guidance_scale INTEGER,
                num_steps INTEGER,
                preset_style TEXT,
                imp TEXT,
                original_prompt TEXT,
                enhanced_prompt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create prompt_enhancements table
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS prompt_enhancements (
                id SERIAL PRIMARY KEY,
                prompt_number INTEGER,
                original_prompt TEXT,
                enhanced_prompt TEXT,
                style_phrases TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes for common queries
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_generations_batch_id ON generations(batch_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_generations_tag ON generations(tag)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at)')


def _init_sqlite():
    """Initialize SQLite database (existing logic)."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Create base table if not exists
    c.execute('''
        CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            prompt TEXT,
            prompt_number INTEGER,
            model_id TEXT,
            status TEXT,
            image_url TEXT,
            local_path TEXT,
            width INTEGER,
            height INTEGER,
            seed INTEGER,
            tag TEXT,
            guidance_scale INTEGER,
            num_steps INTEGER,
            preset_style TEXT,
            imp TEXT,
            created_at TIMESTAMP
        )
    ''')
    
    # Add new columns if they don't exist (for migration)
    for col, col_type in [
        ('prompt_number', 'INTEGER'),
        ('tag', 'TEXT'),
        ('guidance_scale', 'INTEGER'),
        ('num_steps', 'INTEGER'),
        ('preset_style', 'TEXT'),
        ('imp', 'TEXT'),
        ('original_prompt', 'TEXT'),
        ('enhanced_prompt', 'TEXT'),
    ]:
        try:
            c.execute(f'ALTER TABLE generations ADD COLUMN {col} {col_type}')
        except sqlite3.OperationalError:
            pass
    
    # Create prompt_enhancements table
    c.execute('''
        CREATE TABLE IF NOT EXISTS prompt_enhancements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt_number INTEGER,
            original_prompt TEXT,
            enhanced_prompt TEXT,
            style_phrases TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()


# ============================================================
# BATCH ID HELPERS
# ============================================================

async def get_existing_batch_ids() -> set:
    """Get all unique batch_ids that exist in our database (created by this app)."""
    if settings.USE_POSTGRES:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch('SELECT DISTINCT batch_id FROM generations WHERE batch_id IS NOT NULL')
            return {row['batch_id'] for row in rows}
    else:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT DISTINCT batch_id FROM generations WHERE batch_id IS NOT NULL')
        result = {row[0] for row in c.fetchall()}
        conn.close()
        return result


# ============================================================
# INSERT OPERATIONS  
# ============================================================

async def insert_generation(data: dict):
    """Insert a new generation record."""
    if settings.USE_POSTGRES:
        await _insert_generation_postgres(data)
    else:
        _insert_generation_sqlite(data)


async def _insert_generation_postgres(data: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Use provided created_at or default to now
        from datetime import datetime
        created_at = data.get('created_at')
        
        if created_at:
            if isinstance(created_at, str):
                try:
                    # Try ISO format with Z suffix
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except ValueError:
                    try:
                        # Try without timezone
                        created_at = datetime.fromisoformat(created_at.split('.')[0])
                    except ValueError:
                        print(f"[DB] Failed to parse date: {created_at}")
                        created_at = datetime.now()
            elif not isinstance(created_at, datetime):
                created_at = datetime.now()
        else:
            created_at = datetime.now()
        
        await conn.execute('''
            INSERT INTO generations (
                id, batch_id, prompt, prompt_number, model_id, status, image_url, local_path, 
                width, height, seed, tag, guidance_scale, num_steps, preset_style, 
                original_prompt, enhanced_prompt, imp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (id) DO NOTHING
        ''',
            data.get('generationId'),
            data.get('batch_id'),
            data.get('prompt'),
            data.get('prompt_number'),
            data.get('modelId'),
            data.get('status'),
            data.get('image_url'),
            data.get('local_path'),
            data.get('width'),
            data.get('height'),
            data.get('seed'),
            data.get('tag'),
            data.get('guidance_scale'),
            data.get('num_steps'),
            data.get('preset_style'),
            data.get('original_prompt'),
            data.get('enhanced_prompt'),
            data.get('imp'),
            created_at or datetime.now()
        )


def _insert_generation_sqlite(data: dict):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Use provided created_at or default to now
    created_at = data.get('created_at')
    if not created_at:
         created_at = datetime.now().isoformat()
         
    c.execute('''
        INSERT OR IGNORE INTO generations (
            id, batch_id, prompt, prompt_number, model_id, status, image_url, local_path, 
            width, height, seed, tag, guidance_scale, num_steps, preset_style, 
            original_prompt, enhanced_prompt, imp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('generationId'),
        data.get('batch_id'),
        data.get('prompt'),
        data.get('prompt_number'),
        data.get('modelId'),
        data.get('status'),
        data.get('image_url'),
        data.get('local_path'),
        data.get('width'),
        data.get('height'),
        data.get('seed'),
        data.get('tag'),
        data.get('guidance_scale'),
        data.get('num_steps'),
        data.get('preset_style'),
        data.get('original_prompt'),
        data.get('enhanced_prompt'),
        data.get('imp'),
        created_at
    ))
    conn.commit()
    conn.close()


# ============================================================
# UPDATE OPERATIONS
# ============================================================

async def update_tag(generation_id: str, tag: str) -> bool:
    """Update the tag for a generation (accept/maybe/declined)."""
    if settings.USE_POSTGRES:
        return await _update_tag_postgres(generation_id, tag)
    else:
        return _update_tag_sqlite(generation_id, tag)


async def _update_tag_postgres(generation_id: str, tag: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            'UPDATE generations SET tag = $1 WHERE id = $2', 
            tag, generation_id
        )
        return 'UPDATE 1' in result


def _update_tag_sqlite(generation_id: str, tag: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('UPDATE generations SET tag = ? WHERE id = ?', (tag, generation_id))
    updated = c.rowcount > 0
    conn.commit()
    conn.close()
    return updated


# ============================================================
# PROMPT ENHANCEMENTS
# ============================================================

async def save_prompt_enhancement(prompt_number: Optional[int], original: str, enhanced: str, style_phrases: Optional[str] = None):
    """Save a prompt enhancement record."""
    if settings.USE_POSTGRES:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO prompt_enhancements (prompt_number, original_prompt, enhanced_prompt, style_phrases)
                VALUES ($1, $2, $3, $4)
            ''', prompt_number, original, enhanced, style_phrases)
    else:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO prompt_enhancements (prompt_number, original_prompt, enhanced_prompt, style_phrases)
            VALUES (?, ?, ?, ?)
        ''', (prompt_number, original, enhanced, style_phrases))
        conn.commit()
        conn.close()


async def get_enhancement_by_number(prompt_number: int) -> Optional[Dict[str, Any]]:
    """Get the most recent enhancement for a given prompt number."""
    if settings.USE_POSTGRES:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow('''
                SELECT * FROM prompt_enhancements 
                WHERE prompt_number = $1
                ORDER BY created_at DESC 
                LIMIT 1
            ''', prompt_number)
            return dict(row) if row else None
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT * FROM prompt_enhancements 
            WHERE prompt_number = ?
            ORDER BY created_at DESC 
            LIMIT 1
        ''', (prompt_number,))
        row = c.fetchone()
        conn.close()
        return dict(row) if row else None


# ============================================================
# QUERY OPERATIONS
# ============================================================

async def get_history(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Get generation history ordered by created_at DESC."""
    if settings.USE_POSTGRES:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM generations 
                ORDER BY created_at DESC 
                LIMIT $1 OFFSET $2
            ''', limit, offset)
            return [dict(row) for row in rows]
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT * FROM generations 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        rows = c.fetchall()
        conn.close()
        return [dict(row) for row in rows]


async def get_gallery(
    sort_by: str = 'created_at',
    sort_order: str = 'desc',
    tag_filter: Optional[str] = None,
    batch_filter: Optional[str] = None,
    imp_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """Get gallery view with sorting and filtering."""
    if settings.USE_POSTGRES:
        return await _get_gallery_postgres(sort_by, sort_order, tag_filter, batch_filter, imp_filter, limit, offset)
    else:
        return _get_gallery_sqlite(sort_by, sort_order, tag_filter, batch_filter, imp_filter, limit, offset)


async def _get_gallery_postgres(
    sort_by: str, sort_order: str, tag_filter: Optional[str],
    batch_filter: Optional[str], imp_filter: Optional[str],
    limit: int, offset: int
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Build query with filters
        # Show all items in the database (they were either created by this app or synced and matched)
        query = 'SELECT * FROM generations WHERE 1=1'
        params = []
        param_idx = 1
        
        if tag_filter:
            if tag_filter == 'untagged':
                query += ' AND (tag IS NULL OR tag = \'\')'
            else:
                query += f' AND tag = ${param_idx}'
                params.append(tag_filter)
                param_idx += 1
        
        if batch_filter:
            query += f' AND batch_id = ${param_idx}'
            params.append(batch_filter)
            param_idx += 1

        if imp_filter:
            query += f' AND imp = ${param_idx}'
            params.append(imp_filter)
            param_idx += 1
        
        # Validate sort_by
        valid_sorts = ['created_at', 'seed', 'batch_id', 'tag', 'prompt_number']
        if sort_by not in valid_sorts:
            sort_by = 'created_at'
        
        sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
        query += f' ORDER BY {sort_by} {sort_direction}'
        query += f' LIMIT ${param_idx} OFFSET ${param_idx + 1}'
        params.extend([limit, offset])
        
        rows = await conn.fetch(query, *params)
        
        # Get total count
        count_query = 'SELECT COUNT(*) FROM generations WHERE 1=1'
        count_params = []
        param_idx = 1
        if tag_filter:
            if tag_filter == 'untagged':
                count_query += ' AND (tag IS NULL OR tag = \'\')'
            else:
                count_query += f' AND tag = ${param_idx}'
                count_params.append(tag_filter)
                param_idx += 1
        if batch_filter:
            count_query += f' AND batch_id = ${param_idx}'
            count_params.append(batch_filter)
            param_idx += 1
        if imp_filter:
            count_query += f' AND imp = ${param_idx}'
            count_params.append(imp_filter)
        
        total = await conn.fetchval(count_query, *count_params)
        
        # Get unique batches
        batches_rows = await conn.fetch('SELECT DISTINCT batch_id FROM generations ORDER BY batch_id DESC')
        batches = [row['batch_id'] for row in batches_rows if row['batch_id']]
        
        # Get tag counts
        tag_rows = await conn.fetch('SELECT tag, COUNT(*) as count FROM generations GROUP BY tag')
        tag_counts = {row['tag'] or 'untagged': row['count'] for row in tag_rows}
        
        return {
            'items': [dict(row) for row in rows],
            'total': total,
            'batches': batches,
            'tag_counts': tag_counts,
        }


def _get_gallery_sqlite(
    sort_by: str, sort_order: str, tag_filter: Optional[str],
    batch_filter: Optional[str], imp_filter: Optional[str],
    limit: int, offset: int
) -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Build query with filters
    # Show all items in the database
    query = 'SELECT * FROM generations WHERE 1=1'
    params = []
    
    if tag_filter:
        if tag_filter == 'untagged':
            query += ' AND (tag IS NULL OR tag = "")'
        else:
            query += ' AND tag = ?'
            params.append(tag_filter)
    
    if batch_filter:
        query += ' AND batch_id = ?'
        params.append(batch_filter)

    if imp_filter:
        query += ' AND imp = ?'
        params.append(imp_filter)
    
    # Validate sort_by
    valid_sorts = ['created_at', 'seed', 'batch_id', 'tag', 'prompt_number']
    if sort_by not in valid_sorts:
        sort_by = 'created_at'
    
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
    query += f' ORDER BY {sort_by} {sort_direction}'
    query += ' LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    c.execute(query, params)
    rows = c.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) FROM generations WHERE 1=1'
    count_params = []
    if tag_filter:
        if tag_filter == 'untagged':
            count_query += ' AND (tag IS NULL OR tag = "")'
        else:
            count_query += ' AND tag = ?'
            count_params.append(tag_filter)
    if batch_filter:
        count_query += ' AND batch_id = ?'
        count_params.append(batch_filter)
    if imp_filter:
        count_query += ' AND imp = ?'
        count_params.append(imp_filter)
    
    c.execute(count_query, count_params)
    total = c.fetchone()[0]
    
    # Get unique batches
    c.execute('SELECT DISTINCT batch_id FROM generations ORDER BY created_at DESC')
    batches = [row[0] for row in c.fetchall() if row[0]]
    
    # Get tag counts
    c.execute('SELECT tag, COUNT(*) as count FROM generations GROUP BY tag')
    tag_counts = {row[0] or 'untagged': row[1] for row in c.fetchall()}
    
    conn.close()
    
    return {
        'items': [dict(row) for row in rows],
        'total': total,
        'batches': batches,
        'tag_counts': tag_counts,
    }


async def export_gallery(
    tag_filter: Optional[str] = None,
    batch_filter: Optional[str] = None,
    imp_filter: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Export all matching records for CSV generation."""
    if settings.USE_POSTGRES:
        pool = await get_pool()
        async with pool.acquire() as conn:
            query = 'SELECT * FROM generations WHERE 1=1'
            params = []
            param_idx = 1
            
            if tag_filter:
                if tag_filter == 'untagged':
                    query += ' AND (tag IS NULL OR tag = \'\')'
                else:
                    query += f' AND tag = ${param_idx}'
                    params.append(tag_filter)
                    param_idx += 1
            
            if batch_filter:
                query += f' AND batch_id = ${param_idx}'
                params.append(batch_filter)
                param_idx += 1

            if imp_filter:
                query += f' AND imp = ${param_idx}'
                params.append(imp_filter)
            
            query += ' ORDER BY prompt_number ASC, created_at DESC'
            
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        query = 'SELECT * FROM generations WHERE 1=1'
        params = []
        
        if tag_filter:
            if tag_filter == 'untagged':
                query += ' AND (tag IS NULL OR tag = "")'
            else:
                query += ' AND tag = ?'
                params.append(tag_filter)
        
        if batch_filter:
            query += ' AND batch_id = ?'
            params.append(batch_filter)

        if imp_filter:
            query += ' AND imp = ?'
            params.append(imp_filter)
        
        query += ' ORDER BY prompt_number ASC, created_at DESC'
        
        c.execute(query, params)
        rows = c.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]


def generate_export_csv(records: List[Dict[str, Any]], output_path: str) -> str:
    """Generate a CSV file from records with proper formatting."""
    if not records:
        return None
    
    fieldnames = [
        'prompt_number', 'original_prompt', 'prompt', 'enhanced_prompt',
        'tag', 'seed', 'batch_id', 'model_id', 'width', 'height',
        'guidance_scale', 'num_steps', 'preset_style', 'imp',
        'export_filename', 'image_url', 'local_path', 'created_at', 'id'
    ]
    
    for record in records:
        prompt_num = record.get('prompt_number') or record.get('parsed_number')
        
        if not prompt_num and record.get('prompt'):
            num_match = re.match(r'^(\d+)[\t\s]', record['prompt'])
            if num_match:
                prompt_num = num_match.group(1)
        
        prompt_num = prompt_num or 'unknown'
        tag_str = record.get('tag') or 'untagged'
        seed = record.get('seed') or 'random'
        imp = record.get('imp')
        
        if record.get('local_path'):
            ext = os.path.splitext(record['local_path'])[1]
            new_name_parts = [str(prompt_num)]
            if imp:
                new_name_parts.append(f"imp={imp}")
            new_name_parts.append(f"{tag_str}_{seed}")
            record['export_filename'] = f"{'__'.join(new_name_parts)}{ext}"
        else:
            record['export_filename'] = ''
            
        if 'imp' not in record:
            record['imp'] = ''
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(records)
    
    return output_path


# ============================================================
# COST STATISTICS
# ============================================================

async def get_cost_statistics(since_date: datetime) -> Dict[str, Any]:
    """Get image count statistics since a specified date for cost calculation."""
    if settings.USE_POSTGRES:
        return await _get_cost_statistics_postgres(since_date)
    else:
        return _get_cost_statistics_sqlite(since_date)


async def _get_cost_statistics_postgres(since_date: datetime) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchval(
            'SELECT COUNT(*) FROM generations WHERE created_at >= $1',
            since_date
        )
        
        # Get batch count
        batch_count = await conn.fetchval(
            'SELECT COUNT(DISTINCT batch_id) FROM generations WHERE created_at >= $1 AND batch_id IS NOT NULL',
            since_date
        )
        
        # Get daily breakdown (last 30 days)
        breakdown_rows = await conn.fetch('''
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM generations 
            WHERE created_at >= $1
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30
        ''', since_date)
        
        breakdown = [
            {"date": str(row['date']), "count": row['count']}
            for row in breakdown_rows
        ]
        
        return {
            "total_images": total or 0,
            "batch_count": batch_count or 0,
            "breakdown": breakdown
        }


def _get_cost_statistics_sqlite(since_date: datetime) -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    since_str = since_date.isoformat()
    
    # Get total count
    c.execute('SELECT COUNT(*) FROM generations WHERE created_at >= ?', (since_str,))
    total = c.fetchone()[0] or 0
    
    # Get batch count
    c.execute(
        'SELECT COUNT(DISTINCT batch_id) FROM generations WHERE created_at >= ? AND batch_id IS NOT NULL',
        (since_str,)
    )
    batch_count = c.fetchone()[0] or 0
    
    # Get daily breakdown
    c.execute('''
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
        FROM generations 
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
    ''', (since_str,))
    
    breakdown = [
        {"date": row[0], "count": row[1]}
        for row in c.fetchall()
    ]
    
    conn.close()
    
    return {
        "total_images": total,
        "batch_count": batch_count,
        "breakdown": breakdown
    }
