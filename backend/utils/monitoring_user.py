"""
Resolves which farm — and, for now, which user acting as that farm's
identity — the background monitoring loops (sensor polling +
auto-irrigation check, vision camera auto-check) should act on.

resolve_monitoring_farm_id() is the real fix, and the one new code should
call: hardware now explicitly knows which Farm it belongs to (via a Device
row — see models.py's Device and main.py's startup backfill), instead of
guessing from zone ownership.

resolve_monitoring_user_id() is kept for two things only: (1) the one-time
startup backfill in main.py, which needs *some* user to seed the very
first Farm from before any Device/Farm rows exist, and (2) as
resolve_monitoring_farm_id()'s own last-resort fallback on a fresh install
where the backfill hasn't run yet for some reason. Everything else should
prefer the farm-based resolver.
"""

import os
import logging

logger = logging.getLogger(__name__)

_cached_user_id = None
_cached_farm_id = None


def resolve_monitoring_farm_id():
    """Which farm the current backend instance's hardware reports to.
    Resolution order:
      1. FARM_ID env var, if set — explicit and reliable.
      2. The farm_id of the first registered Device (this deployment's one
         physical controller, in the current single-hardware prototype).
      3. The first Farm row that exists at all, if no Device is registered
         yet but a Farm is (e.g. mid-migration).
      4. Falls through to the farm owned by resolve_monitoring_user_id()'s
         pick, only if none of the above found anything — meaning the
         startup backfill in main.py hasn't run/succeeded yet.
    """
    global _cached_farm_id

    env_value = os.getenv('FARM_ID')
    if env_value:
        try:
            return int(env_value)
        except ValueError:
            logger.warning(f"FARM_ID='{env_value}' is not a valid integer, ignoring it")

    if _cached_farm_id is not None:
        return _cached_farm_id

    try:
        from models import Device, Farm

        device = Device.query.order_by(Device.device_id).first()
        if device:
            _cached_farm_id = device.farm_id
            logger.info(f"Resolved monitoring farm_id={_cached_farm_id} from registered Device")
            return _cached_farm_id

        farm = Farm.query.order_by(Farm.farm_id).first()
        if farm:
            _cached_farm_id = farm.farm_id
            logger.info(f"Resolved monitoring farm_id={_cached_farm_id} from first Farm row (no Device registered yet)")
            return _cached_farm_id
    except Exception as e:
        logger.error(f"Could not resolve monitoring farm_id: {e}")

    # Last resort — the startup backfill in main.py should normally have
    # created a Farm already, so reaching here means that didn't happen.
    logger.warning("No Farm or Device found — falling back to legacy user-based resolution")
    fallback_user_id = resolve_monitoring_user_id()
    try:
        from models import Farm
        farm = Farm.query.filter_by(owner_user_id=fallback_user_id).first()
        if farm:
            return farm.farm_id
    except Exception as e:
        logger.error(f"Fallback farm lookup failed: {e}")
    return None


def resolve_monitoring_user_id():
    """Legacy heuristic — 'which user owns the most zones'. Superseded by
    resolve_monitoring_farm_id() for actual monitoring-loop use; kept as
    the seed for main.py's one-time Farm backfill and as a last-resort
    fallback above."""
    global _cached_user_id

    env_value = os.getenv('MONITORING_USER_ID')
    if env_value:
        try:
            return int(env_value)
        except ValueError:
            logger.warning(f"MONITORING_USER_ID='{env_value}' is not a valid integer, ignoring it")

    if _cached_user_id is not None:
        return _cached_user_id

    try:
        from models import IrrigationZone
        from sqlalchemy import func
        from config import database

        row = (
            database.session.query(IrrigationZone.user_id, func.count(IrrigationZone.zone_id))
            .group_by(IrrigationZone.user_id)
            .order_by(func.count(IrrigationZone.zone_id).desc())
            .first()
        )
        if row:
            _cached_user_id = row[0]
            logger.info(f"Resolved monitoring user_id={_cached_user_id} from zone ownership (no MONITORING_USER_ID set)")
            return _cached_user_id
    except Exception as e:
        logger.error(f"Could not resolve monitoring user_id from zones: {e}")

    logger.warning("No MONITORING_USER_ID set and no zones exist yet — defaulting to user_id=1")
    return 1
