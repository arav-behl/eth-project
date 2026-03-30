from __future__ import annotations

import json
from typing import Optional, Tuple

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Q

from .models import Profile, Friendship


def _get_or_create_profile(ens_name: str, address: Optional[str] = None,
                           avatar: Optional[str] = None,
                           display_name: Optional[str] = None) -> Profile:
    profile, created = Profile.objects.get_or_create(
        ens_name=ens_name,
        defaults={
            "address": address,
            "avatar": avatar,
            "display_name": display_name or ens_name,
        },
    )
    if not created and address:
        profile.address = address
        if avatar:
            profile.avatar = avatar
        if display_name:
            profile.display_name = display_name
        profile.save()
    return profile


def _canonical_pair(profile_a: Profile, profile_b: Profile) -> Tuple[Profile, Profile]:
    if profile_a.pk < profile_b.pk:
        return profile_a, profile_b
    return profile_b, profile_a


@require_http_methods(["GET", "POST", "DELETE"])
def friendships_view(request):
    if request.method == "GET":
        return _list_friendships(request)
    elif request.method == "POST":
        return _create_friendship(request)
    else:
        return _delete_friendship(request)


def _list_friendships(request):
    qs = Friendship.objects.select_related("profile_a", "profile_b").all()

    ens_filter = request.GET.get("ens")
    if ens_filter:
        qs = qs.filter(
            Q(profile_a__ens_name=ens_filter) | Q(profile_b__ens_name=ens_filter)
        )

    friendships = []
    for f in qs:
        friendships.append({
            "id": f.pk,
            "ens_a": f.profile_a.ens_name,
            "ens_b": f.profile_b.ens_name,
            "address_a": f.profile_a.address,
            "address_b": f.profile_b.address,
            "created_at": f.created_at.isoformat(),
        })

    return JsonResponse({"friendships": friendships})


def _create_friendship(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    ens_a = body.get("ens_a", "").strip().lower()
    ens_b = body.get("ens_b", "").strip().lower()

    if not ens_a or not ens_b:
        return JsonResponse({"error": "Both ens_a and ens_b are required"}, status=400)
    if ens_a == ens_b:
        return JsonResponse({"error": "Cannot befriend yourself"}, status=400)

    profile_a = _get_or_create_profile(
        ens_a,
        address=body.get("address_a"),
        avatar=body.get("avatar_a"),
        display_name=body.get("display_name_a"),
    )
    profile_b = _get_or_create_profile(
        ens_b,
        address=body.get("address_b"),
        avatar=body.get("avatar_b"),
        display_name=body.get("display_name_b"),
    )

    low, high = _canonical_pair(profile_a, profile_b)

    friendship, created = Friendship.objects.get_or_create(
        profile_a=low,
        profile_b=high,
    )

    if not created:
        return JsonResponse({"error": "Friendship already exists"}, status=409)

    return JsonResponse({
        "id": friendship.pk,
        "ens_a": low.ens_name,
        "ens_b": high.ens_name,
        "created_at": friendship.created_at.isoformat(),
    }, status=201)


def _delete_friendship(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    ens_a = body.get("ens_a", "").strip().lower()
    ens_b = body.get("ens_b", "").strip().lower()

    if not ens_a or not ens_b:
        return JsonResponse({"error": "Both ens_a and ens_b are required"}, status=400)

    deleted, _ = Friendship.objects.filter(
        Q(profile_a__ens_name=ens_a, profile_b__ens_name=ens_b)
        | Q(profile_a__ens_name=ens_b, profile_b__ens_name=ens_a)
    ).delete()

    if deleted == 0:
        return JsonResponse({"error": "Friendship not found"}, status=404)

    return JsonResponse({"deleted": True})
