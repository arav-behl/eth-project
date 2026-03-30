from django.contrib import admin

from .models import Profile, Friendship


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("ens_name", "address", "display_name", "created_at")
    search_fields = ("ens_name", "address")


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ("profile_a", "profile_b", "created_at")
    raw_id_fields = ("profile_a", "profile_b")
