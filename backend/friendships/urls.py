from django.urls import path

from . import views

urlpatterns = [
    path("", views.friendships_view, name="friendships"),
]
