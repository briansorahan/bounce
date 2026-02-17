# Database Management Skills

SQLite commands for managing the Bounce application database.

## Database Location

```bash
~/Library/Application Support/bounce/bounce.db
```

## Database Schema

### Tables

- **command_history** - Command line history
- **debug_logs** - Application debug logs
- **samples** - Audio samples with content hash and binary data

## Common Operations

### Deduplicate Command History

Remove consecutive duplicate commands from the command history table:

```bash
cd ~/Library/Application\ Support/bounce

sqlite3 bounce.db "
DELETE FROM command_history
WHERE id IN (
  SELECT h1.id
  FROM command_history h1
  INNER JOIN command_history h2 
    ON h1.command = h2.command 
    AND h1.timestamp > h2.timestamp
  WHERE NOT EXISTS (
    SELECT 1 FROM command_history h3
    WHERE h3.timestamp > h2.timestamp 
      AND h3.timestamp < h1.timestamp
  )
);
SELECT changes() as removed;
"
```

### View Command History

Show the last 20 commands:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  command,
  datetime(timestamp/1000, 'unixepoch', 'localtime') as time
FROM command_history 
ORDER BY timestamp DESC 
LIMIT 20;
"
```

### Find Duplicate Commands

See which commands have been entered multiple times:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  command, 
  COUNT(*) as count 
FROM command_history 
GROUP BY command 
HAVING count > 1 
ORDER BY count DESC;
"
```

### Database Statistics

Get overview statistics:

```bash
sqlite3 -column bounce.db "
SELECT 
  COUNT(*) as total_commands,
  COUNT(DISTINCT command) as unique_commands
FROM command_history;
"
```

Most frequently used commands:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  command,
  COUNT(*) as count
FROM command_history 
GROUP BY command 
ORDER BY count DESC 
LIMIT 10;
"
```

### Clear Command History

Delete all command history entries:

```bash
sqlite3 bounce.db "DELETE FROM command_history;"
```

### View Debug Logs

Show recent debug logs:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  level,
  message,
  datetime(timestamp/1000, 'unixepoch', 'localtime') as time
FROM debug_logs 
ORDER BY timestamp DESC 
LIMIT 20;
"
```

Count debug logs by level:

```bash
sqlite3 -column bounce.db "
SELECT 
  COUNT(*) as total_logs,
  COUNT(CASE WHEN level = 'error' THEN 1 END) as errors,
  COUNT(CASE WHEN level = 'warn' THEN 1 END) as warnings
FROM debug_logs;
"
```

### Clear Debug Logs

```bash
sqlite3 bounce.db "DELETE FROM debug_logs;"
```

### Interactive Shell

Open SQLite shell for interactive queries:

```bash
cd ~/Library/Application\ Support/bounce
sqlite3 bounce.db
```

Useful shell commands:
- `.tables` - List all tables
- `.schema command_history` - Show table schema
- `.quit` - Exit shell

### Backup Database

```bash
cp ~/Library/Application\ Support/bounce/bounce.db ~/Desktop/bounce-backup-$(date +%Y%m%d).db
```

### Search Command History

Find commands containing specific text:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  command,
  datetime(timestamp/1000, 'unixepoch', 'localtime') as time
FROM command_history 
WHERE command LIKE '%play%'
ORDER BY timestamp DESC;
"
```

## Sample Management

### View Stored Samples

List all stored audio samples:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  substr(hash, 1, 8) as short_hash,
  file_path,
  sample_rate,
  channels,
  duration,
  length(audio_data) as data_size,
  datetime(created_at) as created
FROM samples 
ORDER BY created_at DESC;
"
```

### Find Sample by Hash

```bash
sqlite3 bounce.db "
SELECT 
  id,
  hash,
  file_path,
  sample_rate,
  channels,
  duration
FROM samples 
WHERE hash = 'YOUR_HASH_HERE';
"
```

### Get Sample Statistics

```bash
sqlite3 -column bounce.db "
SELECT 
  COUNT(*) as total_samples,
  SUM(length(audio_data)) / 1024 / 1024 as total_mb,
  AVG(duration) as avg_duration_sec,
  MIN(duration) as min_duration_sec,
  MAX(duration) as max_duration_sec
FROM samples;
"
```

### Remove Old Samples

Delete samples older than 30 days:

```bash
sqlite3 bounce.db "
DELETE FROM samples 
WHERE datetime(created_at) < datetime('now', '-30 days');
"
```

### Clear All Samples

```bash
sqlite3 bounce.db "DELETE FROM samples;"
```

## Feature Management

### View Stored Features

List all analysis features:

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  substr(sample_hash, 1, 8) as sample,
  feature_type,
  length(feature_data) as data_length,
  datetime(created_at) as created
FROM features 
ORDER BY created_at DESC;
"
```

### View Feature Details

See the actual slice positions for a feature:

```bash
sqlite3 bounce.db "
SELECT 
  id,
  feature_type,
  feature_data,
  options
FROM features 
WHERE id = 1;
"
```

### Get Most Recent Feature

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  substr(sample_hash, 1, 8) as sample,
  feature_type,
  datetime(created_at) as created
FROM features 
ORDER BY id DESC 
LIMIT 1;
"
```

## Slice Management

### View All Slices

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  substr(sample_hash, 1, 8) as sample,
  feature_id,
  slice_index,
  start_sample,
  end_sample,
  (end_sample - start_sample) as length
FROM slices 
ORDER BY id;
"
```

### View Slices for a Feature

```bash
sqlite3 -column -header bounce.db "
SELECT 
  id,
  slice_index,
  start_sample,
  end_sample,
  (end_sample - start_sample) as length
FROM slices 
WHERE feature_id = 1 
ORDER BY slice_index;
"
```

### Count Slices by Feature

```bash
sqlite3 -column bounce.db "
SELECT 
  f.id as feature_id,
  f.feature_type,
  COUNT(s.id) as slice_count
FROM features f
LEFT JOIN slices s ON f.id = s.feature_id
GROUP BY f.id;
"
```
