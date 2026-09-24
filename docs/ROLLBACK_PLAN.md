# Rollback Plan

This document describes how to rollback deployments in case of issues.

## Cloudflare Pages Deployment Rollback

### Automatic Rollback (Recommended)

Cloudflare Pages keeps a history of all deployments. You can rollback to any previous deployment instantly through the dashboard:

1. **Go to Cloudflare Dashboard**
   - Navigate to Pages → your project → Deployments

2. **Find the last working deployment**
   - Deployments are listed chronologically
   - Each deployment shows git commit SHA and timestamp

3. **Promote previous deployment**
   - Click on the working deployment
   - Click "Rollback to this deployment"
   - Confirm the rollback

**⏱️ Rollback time:** ~30 seconds (instant)

### CLI Rollback

You can also rollback using Wrangler CLI:

```bash
# List recent deployments
wrangler pages deployment list --project-name=my-website

# Promote a specific deployment
wrangler pages deployment tail <DEPLOYMENT_ID> --project-name=my-website
```

## Database Migration Rollback

### D1 Database

D1 does not have built-in migration rollback. You need to manually write and apply reverse migrations.

#### Process:

1. **Create a reverse migration**

   ```bash
   # Create new migration file
   wrangler d1 migrations create my-website-db rollback_migration_name
   ```

2. **Write reverse SQL**

   Example: If migration `0002_add_column.sql` added a column:
   
   ```sql
   -- Original migration
   ALTER TABLE destinations ADD COLUMN new_field TEXT;
   ```
   
   Rollback migration:
   
   ```sql
   -- Rollback migration
   ALTER TABLE destinations DROP COLUMN new_field;
   ```

3. **Apply rollback migration**

   ```bash
   # Production
   npm run db:migrate:prod
   
   # Or manually
   wrangler d1 migrations apply my-website-db --remote
   ```

#### ⚠️ Important Notes:

- **Test rollback locally first**: Always test in local D1 before production
- **Destructive operations**: Some migrations can't be rolled back (e.g., DROP TABLE)
- **Data loss risk**: Rolling back migrations may lose data
- **Backup first**: Consider exporting data before risky rollbacks

### Database Backup

Before major migrations, create a backup:

```bash
# Export D1 database
wrangler d1 export my-website-db --remote --output=backup-$(date +%Y%m%d).sql
```

Restore from backup:

```bash
# Note: D1 doesn't have direct import yet
# You may need to manually execute SQL statements
wrangler d1 execute my-website-db --remote --file=backup-20240315.sql
```

## R2 Storage Rollback

R2 object storage doesn't have versioning enabled by default. To protect against accidental deletions:

### Prevention (Recommended):

1. **Enable R2 lifecycle rules** (when available)
2. **Never delete originals** — only delete generated variants
3. **Keep local backups** of important photos

### Recovery:

If photos are accidentally deleted:

1. **Check R2 bucket list** for remaining objects:
   ```bash
   wrangler r2 object list my-website-photos
   ```

2. **Re-upload from backup**:
   ```bash
   wrangler r2 object put my-website-photos/path/to/photo.jpg --file=local-backup/photo.jpg
   ```

## Application Code Rollback

### GitHub Revert

If the issue is in application code (not infrastructure):

```bash
# Revert the problematic commit
git revert <BAD_COMMIT_SHA>
git push origin main

# Or reset to previous commit (if no one else has pulled)
git reset --hard <GOOD_COMMIT_SHA>
git push origin main --force
```

This will trigger automatic redeployment via GitHub Actions.

## Emergency Rollback Checklist

Use this checklist during an incident:

- [ ] **Identify the issue**
  - Check error logs in Cloudflare Pages dashboard
  - Check browser console for frontend errors
  - Check API health endpoint: `/api/health`

- [ ] **Determine rollback scope**
  - [ ] Frontend only → Rollback Pages deployment
  - [ ] Backend/API only → Rollback Pages deployment
  - [ ] Database schema → Rollback D1 migration
  - [ ] Both → Rollback deployment + migrations

- [ ] **Execute rollback**
  - [ ] Rollback Cloudflare Pages deployment (see above)
  - [ ] If needed: Apply reverse migration to D1
  - [ ] Verify health check: `curl https://my-website.pages.dev/api/health`

- [ ] **Verify recovery**
  - [ ] Check website loads correctly
  - [ ] Test critical user flows
  - [ ] Verify API endpoints respond correctly
  - [ ] Check Cloudflare analytics for error rate

- [ ] **Post-incident**
  - [ ] Document what went wrong
  - [ ] Create issue for proper fix
  - [ ] Update tests to catch similar issues
  - [ ] Review deployment process

## Rollback Testing

Test rollback procedures regularly (in dev/staging):

```bash
# 1. Deploy a breaking change
git checkout -b test-rollback
# ... make breaking change ...
git commit -m "test: intentional breaking change"
git push

# 2. Verify rollback works
# - Use Cloudflare dashboard to rollback
# - Verify site works again

# 3. Clean up
git checkout main
git branch -D test-rollback
```

## Monitoring & Alerts

Set up alerts to catch issues early:

1. **Cloudflare Analytics**
   - Monitor error rate
   - Set alert for >5% error rate

2. **Health Check Monitoring**
   - Use external monitoring (e.g., UptimeRobot, Pingdom)
   - Alert on `/api/health` failures

3. **Real User Monitoring**
   - Track frontend errors with Sentry or similar
   - Monitor Core Web Vitals

## Prevention is Better than Rollback

Best practices to minimize rollback needs:

- ✅ **Run tests before deploy** (automated in CI/CD)
- ✅ **Test migrations locally** before production
- ✅ **Use feature flags** for risky changes
- ✅ **Deploy during low-traffic hours**
- ✅ **Monitor immediately after deploy**
- ✅ **Keep deployments small** (easier to identify issues)
- ✅ **Document changes** in commit messages

## Contact & Support

In case of emergency:

- **Cloudflare Status**: https://www.cloudflarestatus.com/
- **Cloudflare Support**: https://support.cloudflare.com/ (requires paid plan for live support)
- **GitHub Issues**: Create issue in repository for tracking

---

**Last Updated:** 2024-03-23  
**Owner:** @kejw05
